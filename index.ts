import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { APIGatewayEvent, APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import axios from 'axios';


export const handler: APIGatewayProxyHandler = async (event: APIGatewayEvent): Promise<APIGatewayProxyResult> => {
  try {
    const eventBody = event.body
    if (!eventBody) throw new Error('Body must contain data')
    const eventBodyJson = eventBody as unknown as EventJson
    const tokenFunctionName = eventBodyJson.token_function_name

    const lambda = new LambdaClient({});
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
        Authorization: `Bearer ${token}`
      },
      ...(queryParams ? { params: queryParams } : {})
    });


    console.log('API Response:', apiResponse.data);

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Request successful',
        apiData: apiResponse.data,
        apiHeaders: apiResponse.headers
      }),
    };
  } catch (err) {
    const error = err as Error
    console.error('Error handling the request:', error);

    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Error handling the request',
        errorMessage: error.message
      }),
    };
  }
};

type EventJson = {
  path: string,
  host: string,
  token_function_name: string,
  queryParameters?: any
}
