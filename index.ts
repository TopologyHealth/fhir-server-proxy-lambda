import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { PutObjectCommand, PutObjectCommandInput, S3, S3ClientConfig } from '@aws-sdk/client-s3';
import { APIGatewayEvent, APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import axios, { AxiosResponse } from 'axios';

type WithRequired<T, K extends keyof T> = T & { [P in K]-?: T[P] }
type EventJson = {
  path: string,
  host: string,
  token_function_name: string,
  token_function_region?: string,
  query_parameters?: any,
  bucket_write?: {
    bucket_name: string,
    resource_name: string,
    bucket_region?: string
  }
}

const FHIR_JSON_TYPE = `json`;
const NDJSON_TYPE = `ndjson`;

export const handler: APIGatewayProxyHandler = async (event: APIGatewayEvent): Promise<APIGatewayProxyResult> => {
  try {
    const eventBody = event.body
    if (!eventBody) throw new Error('Body must contain data')
    const eventBodyJson = eventBody as unknown as EventJson

    const token = await getFhirServerToken(eventBodyJson);
    const fhirServerResponse = await makeFhirServerRequest(eventBodyJson, token);
    const bucketWriteParams = eventBodyJson.bucket_write;

    const lambdaResponse = {
      statusCode: 200,
      body: {
        message: 'Request successful',
        fhirServer: {
          headers: fhirServerResponse.headers,
          data: (bucketWriteParams ? {} : fhirServerResponse.data)
        },
        ...(bucketWriteParams ? { bucketWrite: await writeToBucket(bucketWriteParams, fhirServerResponse) } : {})
      },
    };

    console.log('Lambda Response: %o', lambdaResponse);
    return {
      ...(lambdaResponse),
      body: JSON.stringify(lambdaResponse.body)
    };
  } catch (err) {
    return lambdaErrorHandler(err);
  }
};

async function writeToBucket(bucketWriteParams: WithRequired<EventJson, 'bucket_write'>['bucket_write'], fhirServerResponse: AxiosResponse<any, any>) {
  const bucketRegion = bucketWriteParams.bucket_region
  const s3Config: S3ClientConfig = { region: bucketRegion };
  const s3 = new S3(s3Config);
  const todaysDateString = getCurrentDateFormatted();
  const fileName = `${todaysDateString}/${bucketWriteParams.resource_name}`;
  const resourceContentType = fhirServerResponse.headers["content-type"]?.toString();
  const fileType: string = (resourceContentType?.includes('ndjson') ? NDJSON_TYPE : FHIR_JSON_TYPE);
  const commandInput: PutObjectCommandInput = {
    Bucket: bucketWriteParams.bucket_name,
    Key: `${fileName}.${fileType}`,
    Body: fhirServerResponse.data
  };
  const command = new PutObjectCommand(commandInput);
  return s3.send(command);
}

function lambdaErrorHandler(err: unknown) {
  // const error = err as AxiosError;
  const lambdaResponse = {
    statusCode: 500,
    body: err,
  };
  console.error('Error handling the request: %o', lambdaResponse);
  return {
    ...(lambdaResponse),
    body: JSON.stringify(lambdaResponse.body)
  };
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
  const functionRegion = eventBodyJson.token_function_region
  const lambda = new LambdaClient({ ...(functionRegion ? { region: functionRegion } : {}) });
  const tokenLambdaFunctionResponse = await lambda.send(new InvokeCommand({
    FunctionName: eventBodyJson.token_function_name,
    InvocationType: 'RequestResponse'
  }));

  const tokenLambdaPayload = tokenLambdaFunctionResponse.Payload;
  if (!tokenLambdaPayload) throw new Error('Payload must be defined.');
  const payloadAsJson = JSON.parse(Buffer.from(tokenLambdaPayload).toString());

  const token = JSON.parse(payloadAsJson.body).tokenResponse.access_token;
  return token;
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
