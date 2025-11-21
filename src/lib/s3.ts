import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const bucket = process.env.S3_BUCKET_NAME || "";
const region = process.env.S3_REGION || "eu-central-1";

export const s3 = new S3Client({
  region,
  credentials: process.env.S3_ACCESS_KEY_ID
    ? {
        accessKeyId: process.env.S3_ACCESS_KEY_ID!,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
      }
    : undefined,
});

export async function uploadRawObject(key: string, body: Buffer | Uint8Array) {
  if (!bucket || !process.env.S3_ACCESS_KEY_ID) {
    return { key, url: `/dev-storage/${key}` };
  }

  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
    })
  );

  return {
    key,
    url: `https://${bucket}.s3.${region}.amazonaws.com/${key}`,
  };
}
