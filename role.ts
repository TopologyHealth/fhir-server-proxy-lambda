
import { STSClient, AssumeRoleCommand, AssumeRoleCommandOutput, Credentials } from "@aws-sdk/client-sts";
import { SignatureV4Init } from "@aws-sdk/signature-v4";

export async function assumeRole(roleArn: string) {
  const stsClient = new STSClient();
  const command = new AssumeRoleCommand({
    RoleArn: roleArn,
    RoleSessionName: "APIGatewaySession",
  });


  try {
    const response = await stsClient.send(command);
    return getRoleCredentials(response);
  } catch (e) {
    console.error(e, 'Failed to create STS Client')
    throw e
  }
}

function getRoleCredentials(response: AssumeRoleCommandOutput) {
  const { AccessKeyId, SecretAccessKey, SessionToken } = getTokenParams(response.Credentials);
  const tokenParams: SignatureV4Init['credentials'] = {
    accessKeyId: AccessKeyId,
    secretAccessKey: SecretAccessKey,
    sessionToken: SessionToken,
  }
  return tokenParams;
}

function getTokenParams(responseCredentials: Credentials | undefined) {
  if (!responseCredentials) throw new Error('Failed to get credentials from stsClient Response');
  const AccessKeyId = responseCredentials.AccessKeyId;
  const SecretAccessKey = responseCredentials.SecretAccessKey;
  const SessionToken = responseCredentials.SessionToken;
  if (!AccessKeyId || !SecretAccessKey || !SessionToken) throw new Error('One or more credentials are failed to be retrieved from the stsClient Response')
  return { AccessKeyId, SecretAccessKey, SessionToken };
}
