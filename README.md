# FHIR API Lambda Handler

A serverless AWS Lambda function that handles FHIR API requests with token-based authentication. This function first retrieves an access token from another Lambda function and then makes authenticated requests to a FHIR API endpoint.

## Features

- Token retrieval via separate AWS Lambda function
- Configurable FHIR API endpoint
- Support for query parameters
- Async FHIR response handling
- Error handling with detailed responses
- Region-specific Lambda configuration

## Prerequisites

- Node.js 18.x
- AWS CLI configured with appropriate credentials
- AWS SAM CLI (for local development)
- TypeScript

## Installation

1. Clone the repository
2. Install dependencies:

   ```bash
   npm install
   ```

## Configuration

### Using `launch.json`

The `launch.json` file is used to simulate AWS Lambda events locally during development using AWS SAM. Here's the key configuration:

- **Handler**: `index.handler`
- **Runtime**: `nodejs18.x`
- **Project Root**: `${workspaceFolder}/dist`
- **Invoke Target**: Direct code invocation

#### Example Configuration from `launch.json`:

```json
{
  "type": "aws-sam",
  "request": "direct-invoke",
  "name": "backend-lambda:index.handler (nodejs18.x)",
  "invokeTarget": {
    "target": "code",
    "projectRoot": "${workspaceFolder}/dist",
    "lambdaHandler": "index.handler"
  },
  "lambda": {
    "runtime": "nodejs18.x",
    "payload": {
      "json": {
        "body": {
          "token_function_name": "arn:aws:lambda:ca-central-1:105227342372:function:backend-service-dev",
          "token_function_region": "ca-central-1",
          "host": "https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR",
          "path": "BulkRequest/00000000000512E1AA7537B861D4E3B3"
        }
      }
    }
  }
}
```

This configuration simulates a Lambda invocation with a payload that includes:
- Token function ARN and region
- FHIR API host endpoint
- Resource path for the FHIR request

You can use this configuration for testing and debugging the Lambda function locally through VSCode's debugging interface.

### Required AWS Resources

To ensure this Lambda function works correctly, the following AWS resources must be provisioned:

- **AWS Lambda**: The core service to run this function.
- **IAM Role for Lambda**: The Lambda function must be associated with an IAM role that grants it the following permissions:
  - **Invoke Lambda**: To allow the function to invoke the token retrieval Lambda function.
  - **CloudWatch Logs**: For logging execution details to CloudWatch for monitoring and troubleshooting.

### Example IAM Policy

Here is an example of the permissions required for the Lambda function:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": "lambda:InvokeFunction",
            "Resource": "arn:aws:lambda:*:*:function:*-backend-service-*"
        },
        {
            "Effect": "Allow",
            "Action": [
                "logs:CreateLogGroup",
                "logs:CreateLogStream",
                "logs:PutLogEvents"
            ],
            "Resource": "arn:aws:logs:*:*:*"
        }
    ]
}
```

### Deployment Instructions

1. **Install Dependencies**: Install the required dependencies by running:
    ```bash
    npm install
    ```

2. **Build the Lambda Function**: Compile the TypeScript files into JavaScript:
    ```bash
    npm run build
    ```

3. **Package the Lambda function**: Zip all the necessary files:
    ```bash
    zip -r lambda_function.zip dist/ node_modules/
    ```

4. **Deploy to AWS Lambda**: Use the AWS CLI to create or update the Lambda function:
    ```bash
    aws lambda update-function-code \
        --function-name your-lambda-function-name \
        --zip-file fileb://lambda_function.zip
    ```

### Notes

- Ensure that your IAM role has permissions to invoke the token retrieval Lambda function
- The function expects the token Lambda to return a valid FHIR API access token
- All API requests are made with `respond-async` preference header

## Documentation

For detailed documentation on the FHIR API endpoints and response formats, please refer to your FHIR server's documentation.

## Contributing

Contributions to the project are welcome! If you encounter any issues or have suggestions for improvement, please submit a GitHub issue or pull request.

### Ground Rules

#### Contributions and discussion guidelines

By making a contribution to this project, you are deemed to have accepted the [Developer Certificate of Origin](https://developercertificate.org/) (DCO).

All conversations and communities around this code agree to:
- Keep discussions positive, productive, and respectful
- Follow standard GitHub pull request workflows
- Provide clear documentation for any new features
- Include tests for new functionality

#### Reporting Issues

If you found a technical bug or have ideas for features we should implement, please:
1. Check existing issues to avoid duplicates
2. Provide clear reproduction steps
3. Include relevant error messages and logs
4. Specify your environment details (Node.js version, AWS region, etc.)

## License

This code is released under the [Apache 2.0 License](https://opensource.org/license/apache-2-0/). You are free to use, modify, and distribute this library in accordance with the terms of the license.

## Acknowledgments

We would like to thank all contributors who have helped improve this Lambda function.

## About

This Lambda function is designed to facilitate secure FHIR API requests with token-based authentication. It's part of a larger healthcare integration infrastructure.

