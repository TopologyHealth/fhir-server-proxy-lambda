import { PutObjectCommand, PutObjectCommandInput, S3, S3ClientConfig, S3ServiceException } from '@aws-sdk/client-s3';
import { APIGatewayEvent, APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import axios, { AxiosError, AxiosResponse } from 'axios';
import { assumeRole } from "./role";
import { invokeApiGateway } from './apiGateway';

type WithRequired<T, K extends keyof T> = T & { [P in K]-?: T[P] }
export type EventJson = {
  token_gateway: {
    headers: {
      client_id: string,
      emr_type: string,
    },
    endpoint: string,
    role: {
      arn: string,
      region: string,
    }
  }
  path: string,
  host: string,
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

require('source-map-support').install();

export const handler: APIGatewayProxyHandler = async (event: APIGatewayEvent): Promise<APIGatewayProxyResult> => {
  try {
    const eventBody = event.body
    if (!eventBody) throw new Error('Body must contain data')
    const eventBodyJson = eventBody as unknown as EventJson

    const token = await getFhirServerToken(eventBodyJson);
    console.log('token', token)
    // const fhirServerResponse = await makeFhirServerRequest(eventBodyJson, token);
    const bucketWriteParams = eventBodyJson.bucket_write;

    // const bucketGetResponse = async () => {
    //   if (bucketWriteParams) {
    //     const bucketWriteResult = await writeToBucket(bucketWriteParams, fhirServerResponse);
    //     return {
    //       bucketWrite: {
    //         ...bucketWriteResult,
    //         dateString: TODAYS_DATE_STRING
    //       }
    //     };
    //   }
    //   return {};
    // };
    const lambdaResponse = {
      statusCode: 200,
      body: {
        message: 'Request successful',
        fhirServer: {
          headers: {},//fhirServerResponse.headers,
          data: (bucketWriteParams ? {} : {})//fhirServerResponse.data)
        },
        // ...(await bucketGetResponse())
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
    return {
      statusCode: 500,
      body: 'Internal Server Error'
    };
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

  if (err.response) {
    console.error('Error Response:', err.response.data);
    console.error('Error Status:', err.response.status);
    console.error('Error Headers:', err.response.headers);
  } else if (err.request) {
    console.error('Error Request:', err.request);
  } else {
    console.error('Error Message:', err.message);
  }
  console.error('Error Config:', err.config);
  return {
    statusCode: err.status ?? err.response?.status ?? 500,
    body: JSON.stringify({
      type: 'Axios Error',
      cause: err.cause,
      data: err.response?.data
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

async function getFhirServerToken(eventBodyJson: EventJson) {
  const roleCredentials = await assumeRole(eventBodyJson.token_gateway.role.arn)
  const endpointResponse = await invokeApiGateway(eventBodyJson.token_gateway, roleCredentials)
  // const functionRegion = eventBodyJson.token_function_region
  // const lambda = new LambdaClient({ ...(functionRegion ? { region: functionRegion } : {}) });
  // const tokenLambdaFunctionResponse = await lambda.send(new InvokeCommand({
  //   FunctionName: eventBodyJson.token_function_name,
  //   InvocationType: 'RequestResponse'
  // }));

  // const tokenLambdaPayload = tokenLambdaFunctionResponse.Payload;
  // if (!tokenLambdaPayload) throw new Error('Payload must be defined.');
  // const payloadAsJson = JSON.parse(Buffer.from(tokenLambdaPayload).toString());

  // const token = JSON.parse(payloadAsJson.body).tokenResponse.access_token;

  return endpointResponse;
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
