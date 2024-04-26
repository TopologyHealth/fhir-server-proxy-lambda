import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { APIGatewayEvent, APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import axios, { AxiosError } from 'axios';


export const handler: APIGatewayProxyHandler = async (event: APIGatewayEvent): Promise<APIGatewayProxyResult> => {
  try {
    const eventBody = event.body
    if (!eventBody) throw new Error('Body must contain data')
    const eventBodyJson = eventBody as unknown as EventJson
    const tokenFunctionName = eventBodyJson.token_function_name
    const functionRegion = eventBodyJson.token_function_region

    const token = await getFhirServerToken(tokenFunctionName, functionRegion);
    const fhirServerResponse = await makeFhirServerRequest(eventBodyJson, token);

    const lambdaResponse = {
      statusCode: 200,
      body: {
        message: 'Request successful',
        apiHeaders: fhirServerResponse.headers,
        apiData: fhirServerResponse.data
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

type EventJson = {
  path: string,
  host: string,
  token_function_name: string,
  token_function_region?: string,
  queryParameters?: any
}
function lambdaErrorHandler(err: unknown) {
  const error = err as AxiosError;
  const lambdaResponse = {
    statusCode: 500,
    body: {
      message: 'Error handling the request',
      errorMessage: error.message,
      data: error.response?.data,
      statusText: error.response?.statusText
    },
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
      Accept: `application/fhir+json`,
      Prefer: `respond-async`
    },
    ...(eventBodyJson.queryParameters ? { params: eventBodyJson.queryParameters } : {})
  });
}

async function getFhirServerToken(tokenFunctionName: string, functionRegion?: string) {
  const lambda = new LambdaClient({ ...(functionRegion ? { region: functionRegion } : {}) });
  const tokenLambdaFunctionResponse = await lambda.send(new InvokeCommand({
    FunctionName: tokenFunctionName,
    InvocationType: 'RequestResponse'
  }));

  const tokenLambdaPayload = tokenLambdaFunctionResponse.Payload;
  if (!tokenLambdaPayload) throw new Error('Payload must be defined.');
  const payloadAsJson = JSON.parse(Buffer.from(tokenLambdaPayload).toString());

  const token = JSON.parse(payloadAsJson.body).tokenResponse.access_token;
  return token;
}

