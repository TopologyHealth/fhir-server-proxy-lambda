import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { PutObjectCommand, PutObjectCommandInput, S3, S3ClientConfig, S3ServiceException } from '@aws-sdk/client-s3';
import { AssumeRoleCommand, AssumeRoleCommandOutput, Credentials, STSClient } from "@aws-sdk/client-sts";
import { SignatureV4Init } from "@aws-sdk/signature-v4";
import assert from "assert";
import { APIGatewayEvent, APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import axios, { AxiosError, AxiosResponse } from 'axios';

type WithRequired<T, K extends keyof T> = T & { [P in K]-?: T[P] }
type EventJson = {
  path: string,
  host: string,
  token_function_config: {
    function_name: string,
    function_region?: string,
    role_getter_arn: string,
    headers: {
      clientId: string,
      emrType: string,
      scopes: string
    }
  }
  query_parameters?: any,
  bucket_write?: {
    bucket_name: string,
    resource_name: string,
    bucket_region?: string
  }
}

const JSON_FILE_EXTENSION = `json`;
const FHIR_JSON_TYPE = `application/fhir+json`
const NDJSON_FILE_EXTENSION = `ndjson`;
const TODAYS_DATE_STRING = getCurrentDateFormatted();

export const handler: APIGatewayProxyHandler = async (event: APIGatewayEvent): Promise<APIGatewayProxyResult> => {
  try {
    const eventBody = event.body
    if (!eventBody) throw new Error('Body must contain data')
    const eventBodyJson = eventBody as unknown as EventJson

    const token = await getFhirServerToken(eventBodyJson);
    const fhirServerResponse = await makeFhirServerRequest(eventBodyJson, token);
    const bucketWriteParams = eventBodyJson.bucket_write;

    const bucketGetResponse = async () => {
      if (bucketWriteParams) {
        const bucketWriteResult = await writeToBucket(bucketWriteParams, fhirServerResponse);
        return {
          bucketWrite: {
            ...bucketWriteResult,
            dateString: TODAYS_DATE_STRING
          }
        };
      }
      return {};
    };
    const lambdaResponse = {
      statusCode: 200,
      body: {
        message: 'Request successful',
        fhirServer: {
          headers: fhirServerResponse.headers,
          data: (bucketWriteParams ? {} : fhirServerResponse.data)
        },
        ...(await bucketGetResponse())
      },
    };

    console.log('Lambda Response: %o', lambdaResponse);
    return {
      ...(lambdaResponse),
      body: JSON.stringify(lambdaResponse.body)
    };
  } catch (err) {
    if (err instanceof AxiosError) {
      return handleAxiosError(err)
    }
    if (err instanceof S3ServiceException) {
      return handleS3ServiceExceptionError(err)
    }
    const lambdaResponse = {
      statusCode: 500,
      body: 'Unknown Error Occurred',
      error: err
    };
    console.error('Error handling the request: %o', lambdaResponse);
    return lambdaResponse;
  }
};

function handleS3ServiceExceptionError(err: S3ServiceException): APIGatewayProxyResult {
  return {
    statusCode: err.$response?.statusCode ?? err.$metadata.httpStatusCode ?? 500,
    body: JSON.stringify({
      type: 'S3 Error',
      cause: err.name,
      data: err.message
    })
  };
}

function handleAxiosError(err: AxiosError<any, any>): APIGatewayProxyResult {
  return {
    statusCode: err.status ?? err.response?.status ?? 500,
    body: JSON.stringify({
      name: err.name,
      code: err.code,
      cause: err.cause,
      message: err.message,
      config: {
        headers: {
          Accept: err.config?.headers.Accept,
          Prefer: err.config?.headers.Prefer
        },
        method: err.config?.method,
        url: err.config?.url
      },
    })
  };
}

async function writeToBucket(bucketWriteParams: WithRequired<EventJson, 'bucket_write'>['bucket_write'], fhirServerResponse: AxiosResponse<any, any>) {
  const bucketRegion = bucketWriteParams.bucket_region
  const s3Config: S3ClientConfig = { region: bucketRegion };
  const s3 = new S3(s3Config);
  const fileName = `${TODAYS_DATE_STRING}/${bucketWriteParams.resource_name}`;
  const resourceContentType = fhirServerResponse.headers["content-type"]?.toString();
  const fileType: string = (resourceContentType?.includes('ndjson') ? NDJSON_FILE_EXTENSION : JSON_FILE_EXTENSION);
  const commandInput: PutObjectCommandInput = {
    Bucket: bucketWriteParams.bucket_name,
    Key: `${fileName}.${fileType}`,
    Body: fhirServerResponse.data
  };
  const command = new PutObjectCommand(commandInput);
  return s3.send(command);
}

async function makeFhirServerRequest(eventBodyJson: EventJson, token: any) {
  return await axios.get(`${eventBodyJson.host}/${eventBodyJson.path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: FHIR_JSON_TYPE,
      Prefer: `respond-async`
    },
    ...(eventBodyJson.query_parameters ? { params: eventBodyJson.query_parameters } : {})
  });
}

async function assumeRole(roleArn: string) {
  const stsClient = new STSClient();
  const command = new AssumeRoleCommand({
    RoleArn: roleArn,
    RoleSessionName: "APIGatewaySession"
  });


  try {
    const response = await stsClient.send(command);
    const assumedRoleUser = response.AssumedRoleUser;
    assert(assumedRoleUser, 'Assumed Role User must be defined');
    return assumedRoleUser
  } catch (e) {
    console.error(e, 'Failed to create STS Client in order to Assume Role.')
    throw e
  }
}



async function getFhirServerToken(eventBodyJson: EventJson) {
  const functionRegion = eventBodyJson.token_function_config.function_region
  const roleGetterArn = eventBodyJson.token_function_config.role_getter_arn
  const assumedRoleUser = await assumeRole(roleGetterArn);
  const lambda = new LambdaClient({ ...(functionRegion ? { region: functionRegion } : {})});
  const tokenLambdaFunctionResponse = await lambda.send(new InvokeCommand({
    FunctionName: eventBodyJson.token_function_config.function_name,
    InvocationType: 'RequestResponse',
    Payload: JSON.stringify({
      "headers": {
        "clientId": eventBodyJson.token_function_config.headers.clientId,
        "emrType": eventBodyJson.token_function_config.headers.emrType,
        "scopes": eventBodyJson.token_function_config.headers.scopes
      },
      "requestContext": {
        "identity": {
          "userArn": assumedRoleUser.Arn
        }
      }
    }
    )
  }));

  const tokenLambdaPayload = tokenLambdaFunctionResponse.Payload;
  if (!tokenLambdaPayload) throw new Error('Payload must be defined.');
  const tokenPayloadAsString = Buffer.from(tokenLambdaPayload).toString();
  try {
    const payloadAsJson = JSON.parse(tokenPayloadAsString);
    const token = JSON.parse(payloadAsJson.body).tokenResponse.access_token;
    return token;
  } catch (e) {
    console.error(e, 'Failed to Parse JSON: ', tokenPayloadAsString);
    throw e;
  }

}

function getCurrentDateFormatted(): string {
  const now = new Date();

  const year = now.getFullYear();
  // Pad the month with a leading zero if it is less than 10
  const month = String(now.getMonth() + 1).padStart(2, '0');
  // Pad the day with a leading zero if it is less than 10
  const day = String(now.getDate()).padStart(2, '0');

  return `${year}${month}${day}`;
}
