import { Sha256 } from "@aws-crypto/sha256-js";
import { HttpRequest } from "@aws-sdk/protocol-http";
import { SignatureV4, SignatureV4Init } from "@aws-sdk/signature-v4";
import axios from "axios";
import { EventJson } from ".";

export async function invokeApiGateway(tokenGatewayParams: EventJson['token_gateway'], credentials: SignatureV4Init['credentials']) {
  const signer = new SignatureV4({
    credentials: credentials,
    service: 'execute-api',
    region: tokenGatewayParams.role.region,
    sha256: Sha256
  });

  const apiEndpoint = tokenGatewayParams.endpoint
  const host = apiEndpoint.split("/")[2];
  const request = new HttpRequest({
    protocol: 'https:',
    hostname: host,
    path: `/${apiEndpoint.split("/").slice(3).join("/")}`,
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Host': host,
      'emrType': tokenGatewayParams.headers.emr_type,
      'clientId': tokenGatewayParams.headers.client_id
    }
    // ,
    // body: JSON.stringify({
    //   key1: 'value1',
    //   key2: 'value2',
    //   key3: 'value3'
    // })
  });

  const signedRequest = await signer.sign(request);
  const axiosConfig = {
    url: apiEndpoint,
    method: signedRequest.method,
    headers: signedRequest.headers,
    data: signedRequest.body
  };
  console.log('Axios Config', axiosConfig)
  const response = await axios(axiosConfig);
  return response.data;
}
