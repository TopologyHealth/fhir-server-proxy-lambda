import { APIGatewayEvent, APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import axios from 'axios';

// Initialize the Lambda client
// const lambda = new AWS.Lambda();

// Define the handler function
export const handler: APIGatewayProxyHandler = async (event: APIGatewayEvent): Promise<APIGatewayProxyResult> => {
  try {
    const eventBody = event.body
    if (!eventBody) throw new Error('Body must contain data')
    const eventBodyJson = eventBody as unknown as EventJson
    //TODO: Step 1: Invoke another Lambda function using IAM role
    // const lambdaResponse = await lambda.invoke({
    //   FunctionName: 'your-other-lambda-function-name',
    //   InvocationType: 'RequestResponse'
    // }).promise();

    const tokenLambdaFunctionResponse = await axios.get('https://d5nfsx63n2.execute-api.ca-central-1.amazonaws.com/sandbox/mindtrace')

    // Assuming the Lambda function returns the token directly
    const token = tokenLambdaFunctionResponse.data.tokenResponse.access_token;
    const path = eventBodyJson.path
    const queryParams = eventBodyJson.queryParameters

    // Step 2: Make an authenticated HTTP request to an API Gateway endpoint
    const apiResponse = await axios.get(`https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/${path}`, {
      headers: {
        Authorization: `Bearer ${token}`
      },
      ...(queryParams ? { params: queryParams } : {})
    });

    // Step 3: Log the successful execution and return data
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
  path: string
  queryParameters?: any
}
