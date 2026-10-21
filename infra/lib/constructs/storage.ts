/**
 * Bucket bài nộp (infra-plan mục 4.2): private, Block Public Access, SSE-S3,
 * chỉ HTTPS, BucketOwnerEnforced (tắt ACL). Không versioning, không chuyển lớp
 * lưu trữ (file nhỏ, IA/Glacier đắt hơn ở quy mô này).
 *
 * Lifecycle duy nhất: xoá object còn tag `state=pending` (upload không
 * finalize) sau 1 ngày, abort multipart dở dang sau 1 ngày. Finalize đổi tag
 * thành `state=final` nên bài đã nộp không bao giờ bị xoá.
 */
import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import type { StackConfig } from '../config.js';

export class Storage extends Construct {
  readonly bucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: { config: StackConfig }) {
    super(scope, id);
    const { config } = props;

    this.bucket = new s3.Bucket(this, 'SubmissionsBucket', {
      bucketName: `quick-grading-${config.stage}-${config.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      versioned: false,
      lifecycleRules: [
        {
          id: 'expire-pending-uploads',
          tagFilters: { state: 'pending' },
          expiration: Duration.days(1),
        },
        {
          id: 'abort-incomplete-multipart',
          abortIncompleteMultipartUploadAfter: Duration.days(1),
        },
      ],
      cors: [
        {
          allowedMethods: [s3.HttpMethods.POST, s3.HttpMethods.GET],
          allowedOrigins: config.allowedOrigins,
          allowedHeaders: ['*'],
          maxAge: 3000,
        },
      ],
      // Không dùng autoDeleteObjects (thêm 1 custom-resource Lambda). Bucket
      // còn dữ liệu sẽ chặn xoá stack, đó là kết quả an toàn.
      removalPolicy: config.stage === 'prod' ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    });
  }
}
