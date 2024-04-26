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

    const lambda = new LambdaClient({ ...(functionRegion ? { region: functionRegion } : {}) });
    const tokenLambdaFunctionResponse = await lambda.send(new InvokeCommand({
      FunctionName: tokenFunctionName,
      InvocationType: 'RequestResponse'
    }));

    const { Payload, LogResult } = tokenLambdaFunctionResponse
    if (!Payload) throw new Error('Payload must be defined.')
    const payloadAsJson = JSON.parse(Buffer.from(Payload).toString());

    const token = JSON.parse(payloadAsJson.body).tokenResponse.access_token;
    const path = eventBodyJson.path
    const host = eventBodyJson.host
    const queryParams = eventBodyJson.queryParameters


    const apiResponse = await axios.get(`${host}/${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: `application/fhir+json`,
        Prefer: `respond-async`
      },
      ...(queryParams ? { params: queryParams } : {})
    });


    console.log('API Response:', apiResponse.data);

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Request successful',
        apiHeaders: apiResponse.headers,
        apiData: apiResponse.data
      }),
    };
  } catch (err) {
    const error = err as AxiosError
    console.error('Error handling the request:', error);

    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Error handling the request',
        errorMessage: error.message,
        data: error.response?.data,
        statusText: error.response?.statusText
      }),
    };
  }
};

type EventJson = {
  path: string,
  host: string,
  token_function_name: string,
  token_function_region?: string,
  queryParameters?: any
}
