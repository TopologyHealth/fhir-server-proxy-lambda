import { APIGatewayProxyHandler } from 'aws-lambda';
import axios from 'axios';
import * as AWS from 'aws-sdk';

// Initialize the Lambda client
const lambda = new AWS.Lambda();

// Define the handler function
export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        // Step 1: Invoke another Lambda function using IAM role
        const lambdaResponse = await lambda.invoke({
            FunctionName: 'your-other-lambda-function-name',
            InvocationType: 'RequestResponse',
            Payload: JSON.stringify({ /* your payload here */ })
        }).promise();

        // Assuming the Lambda function returns the token directly
        const token = JSON.parse(lambdaResponse.Payload as string).token;

        // Step 2: Make an authenticated HTTP request to an API Gateway endpoint
        const apiResponse = await axios.get('https://<api-id>.execute-api.<region>.amazonaws.com/<stage>/<resource>', {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        // Step 3: Log the successful execution and return data
        console.log('API Response:', apiResponse.data);

        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'Request successful',
                apiData: apiResponse.data
            }),
        };
    } catch (error) {
        console.error('Error handling the request:', error);

        return {
            statusCode: 500,
            body: JSON.stringify({
                message: 'Error handling the request',
                errorMessage: error.message,
                errorDetails: error.response?.data || 'No additional error information',
            }),
        };
    }
};
