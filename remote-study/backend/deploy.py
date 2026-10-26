#!/usr/bin/env python3
"""Reviewable CloudFormation plan. AWS is changed only with the apply command."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys
import uuid

HERE = Path(__file__).resolve().parent
DEFAULT_ORIGIN = "https://main.d3g93doyp3ywja.amplifyapp.com"


def private_json(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f:
        json.dump(data, f, indent=2); f.write("\n")
    os.chmod(path, 0o600)


def initialize(path, origin=DEFAULT_ORIGIN):
    path = Path(path)
    if path.exists():
        raise ValueError("Private configuration already exists; preserve it for redeployment")
    config = {"profile": "my-aws", "region": "us-east-1", "stack_name": "hll04-remote-study-v3", "origin": origin,
              "retention_days": 90, "daily_session_limit": 100, "token_secret": secrets.token_hex(32),
              "rate_salt": secrets.token_hex(32), "invite_code": secrets.token_urlsafe(24), "synthetic_invite_code": secrets.token_urlsafe(24)}
    private_json(path, config)
    return {"private_config": str(path), "origin": origin, "notice": "Keep private. Reuse this file on redeployment; do not put credentials in browser configuration."}


def template(code):
    ref = lambda x: {"Ref": x}
    att = lambda x, y: {"Fn::GetAtt": [x, y]}
    sub = lambda x: {"Fn::Sub": x}
    parameters = {"AllowedOrigin": {"Type": "String", "AllowedPattern": r"https://[a-z0-9.-]+"},
                  "RetentionDays": {"Type": "Number", "MinValue": 1, "MaxValue": 365},
                  "DailySessionLimit": {"Type": "Number", "MinValue": 1, "MaxValue": 1000}}
    for name in ("TokenSecret", "RateSalt", "InviteHash", "SyntheticInviteHash"):
        parameters[name] = {"Type": "String", "NoEcho": True, "MinLength": 64, "MaxLength": 64, "AllowedPattern": "[a-f0-9]{64}"}
    resources = {
      "ResultsBucket": {"Type": "AWS::S3::Bucket", "DeletionPolicy": "Retain", "UpdateReplacePolicy": "Retain", "Properties": {
        "BucketEncryption": {"ServerSideEncryptionConfiguration": [{"ServerSideEncryptionByDefault": {"SSEAlgorithm": "AES256"}}]},
        "PublicAccessBlockConfiguration": {"BlockPublicAcls": True, "BlockPublicPolicy": True, "IgnorePublicAcls": True, "RestrictPublicBuckets": True},
        "OwnershipControls": {"Rules": [{"ObjectOwnership": "BucketOwnerEnforced"}]},
        "LifecycleConfiguration": {"Rules": [{"Id": "expire-study-records", "Status": "Enabled", "Prefix": "records/", "ExpirationInDays": ref("RetentionDays"), "AbortIncompleteMultipartUpload": {"DaysAfterInitiation": 1}}]}}},
      "BucketPolicy": {"Type": "AWS::S3::BucketPolicy", "Properties": {"Bucket": ref("ResultsBucket"), "PolicyDocument": {"Version": "2012-10-17", "Statement": [{"Sid": "DenyPlainHttp", "Effect": "Deny", "Principal": "*", "Action": "s3:*", "Resource": [att("ResultsBucket", "Arn"), sub("${ResultsBucket.Arn}/*")], "Condition": {"Bool": {"aws:SecureTransport": "false"}}}]}}},
      "SessionsTable": {"Type": "AWS::DynamoDB::Table", "DeletionPolicy": "Retain", "UpdateReplacePolicy": "Retain", "Properties": {
        "BillingMode": "PAY_PER_REQUEST", "AttributeDefinitions": [{"AttributeName": "pk", "AttributeType": "S"}, {"AttributeName": "sk", "AttributeType": "S"}],
        "KeySchema": [{"AttributeName": "pk", "KeyType": "HASH"}, {"AttributeName": "sk", "KeyType": "RANGE"}],
        "SSESpecification": {"SSEEnabled": True}, "TimeToLiveSpecification": {"AttributeName": "expires_at", "Enabled": True}}},
      "LogGroup": {"Type": "AWS::Logs::LogGroup", "Properties": {"LogGroupName": sub("/aws/lambda/${AWS::StackName}"), "RetentionInDays": 14}},
      "ExecutionRole": {"Type": "AWS::IAM::Role", "Properties": {
        "AssumeRolePolicyDocument": {"Version": "2012-10-17", "Statement": [{"Effect": "Allow", "Principal": {"Service": "lambda.amazonaws.com"}, "Action": "sts:AssumeRole"}]},
        "Policies": [{"PolicyName": "study-private-storage-only", "PolicyDocument": {"Version": "2012-10-17", "Statement": [
          {"Effect": "Allow", "Action": ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:ConditionCheckItem"], "Resource": att("SessionsTable", "Arn")},
          {"Effect": "Allow", "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"], "Resource": sub("${ResultsBucket.Arn}/records/*")},
          {"Effect": "Allow", "Action": ["s3:ListBucket"], "Resource": att("ResultsBucket", "Arn"), "Condition": {"StringLike": {"s3:prefix": "records/*"}}},
          {"Effect": "Allow", "Action": ["logs:CreateLogStream", "logs:PutLogEvents"], "Resource": att("LogGroup", "Arn")}
        ]}}]}},
      "Function": {"Type": "AWS::Lambda::Function", "DependsOn": "LogGroup", "Properties": {
        "FunctionName": ref("AWS::StackName"), "Runtime": "python3.12", "Handler": "index.lambda_handler", "Role": att("ExecutionRole", "Arn"),
        "MemorySize": 256, "Timeout": 30, "ReservedConcurrentExecutions": 5, "Code": {"ZipFile": code},
        "Environment": {"Variables": {"TABLE_NAME": ref("SessionsTable"), "DATA_BUCKET": ref("ResultsBucket"), "ALLOWED_ORIGIN": ref("AllowedOrigin"),
          "TOKEN_SECRET": ref("TokenSecret"), "RATE_SALT": ref("RateSalt"), "INVITE_HASH": ref("InviteHash"), "SYNTHETIC_INVITE_HASH": ref("SyntheticInviteHash"),
          "RETENTION_DAYS": ref("RetentionDays"), "DAILY_SESSION_LIMIT": ref("DailySessionLimit")}}}},
      # The handler owns OPTIONS/CORS, avoiding duplicate Allow-Origin headers.
      "FunctionUrl": {"Type": "AWS::Lambda::Url", "Properties": {"TargetFunctionArn": att("Function", "Arn"), "AuthType": "NONE", "InvokeMode": "BUFFERED"}},
      "UrlPermission": {"Type": "AWS::Lambda::Permission", "Properties": {"FunctionName": ref("Function"), "Action": "lambda:InvokeFunctionUrl", "Principal": "*", "FunctionUrlAuthType": "NONE"}},
      "UrlOnlyInvokePermission": {"Type": "AWS::Lambda::Permission", "Properties": {"FunctionName": ref("Function"), "Action": "lambda:InvokeFunction", "Principal": "*", "InvokedViaFunctionUrl": True}}
    }
    return {"AWSTemplateFormatVersion": "2010-09-09", "Description": "HLL04 remote v3 private study collection; dedicated resources only", "Parameters": parameters, "Resources": resources,
            "Outputs": {"ApiUrl": {"Value": att("FunctionUrl", "FunctionUrl")}, "ResultsBucket": {"Value": ref("ResultsBucket")}, "SessionsTable": {"Value": ref("SessionsTable")}, "FunctionName": {"Value": ref("Function")}}}


def plan(config_path, evidence_dir):
    c = json.loads(Path(config_path).read_text())
    if c["profile"] != "my-aws" or c["region"] != "us-east-1":
        raise ValueError("This reviewed helper is scoped to my-aws / us-east-1")
    if not 1 <= int(c["retention_days"]) <= 365 or not c["origin"].startswith("https://") or "/" in c["origin"][8:]:
        raise ValueError("Invalid retention or exact HTTPS origin")
    code = (HERE / "handler.py").read_text()
    compile(code, "index.py", "exec")
    directory = Path(evidence_dir); directory.mkdir(parents=True, exist_ok=True)
    os.chmod(directory, 0o700)
    public_template = directory / "template.json"
    public_template.write_text(json.dumps(template(code), indent=2) + "\n")
    values = {"AllowedOrigin": c["origin"], "RetentionDays": str(c["retention_days"]), "DailySessionLimit": str(c["daily_session_limit"]),
              "TokenSecret": c["token_secret"], "RateSalt": c["rate_salt"], "InviteHash": hashlib.sha256(c["invite_code"].encode()).hexdigest(),
              "SyntheticInviteHash": hashlib.sha256(c["synthetic_invite_code"].encode()).hexdigest()}
    private_json(directory / "parameters.private.json", [{"ParameterKey": k, "ParameterValue": v} for k, v in values.items()])
    summary = {"stack_name": c["stack_name"], "profile": c["profile"], "region": c["region"], "origin": c["origin"], "retention_days": c["retention_days"],
               "handler_sha256": hashlib.sha256(code.encode()).hexdigest(), "resources": list(template(code)["Resources"]), "applied": False,
               "review": "Dedicated private encrypted bucket/table, no existing resources; exact-origin handler CORS; Lambda URL public invocation with app invite/session authorization; role scoped to new storage; no EC2."}
    (directory / "plan-summary.json").write_text(json.dumps(summary, indent=2) + "\n")
    return c, directory, summary


def aws(c, arguments, allow_failure=False):
    command = ["aws", "--profile", c["profile"], "--region", c["region"], "--no-cli-pager", *arguments]
    run = subprocess.run(command, text=True, capture_output=True)
    if run.returncode and not allow_failure:
        raise RuntimeError(run.stderr.strip())
    return run


def apply(config_path, evidence_dir):
    c, directory, summary = plan(config_path, evidence_dir)
    old = aws(c, ["cloudformation", "describe-stacks", "--stack-name", c["stack_name"]], True)
    if old.returncode and "does not exist" not in old.stderr:
        raise RuntimeError(old.stderr.strip())
    kind = "CREATE" if old.returncode else "UPDATE"
    change = "reviewed-" + uuid.uuid4().hex[:16]
    run = aws(c, ["cloudformation", "create-change-set", "--stack-name", c["stack_name"], "--change-set-name", change,
                  "--change-set-type", kind, "--template-body", "file://" + str((directory / "template.json").resolve()),
                  "--parameters", "file://" + str((directory / "parameters.private.json").resolve()), "--capabilities", "CAPABILITY_IAM"])
    (directory / "change-set-created.json").write_text(run.stdout)
    wait = aws(c, ["cloudformation", "wait", "change-set-create-complete", "--stack-name", c["stack_name"], "--change-set-name", change], True)
    detail = json.loads(aws(c, ["cloudformation", "describe-change-set", "--stack-name", c["stack_name"], "--change-set-name", change]).stdout)
    # DescribeChangeSet returns NoEcho parameters masked; do not copy parameters anyway.
    detail.pop("Parameters", None)
    (directory / "change-set-review.json").write_text(json.dumps(detail, indent=2) + "\n")
    if wait.returncode:
        reason = detail.get("StatusReason", "")
        if "didn't contain changes" not in reason and "No updates are to be performed" not in reason:
            raise RuntimeError("Change set not ready: " + reason)
    else:
        aws(c, ["cloudformation", "execute-change-set", "--stack-name", c["stack_name"], "--change-set-name", change])
        aws(c, ["cloudformation", "wait", "stack-create-complete" if kind == "CREATE" else "stack-update-complete", "--stack-name", c["stack_name"]])
    stack = json.loads(aws(c, ["cloudformation", "describe-stacks", "--stack-name", c["stack_name"]]).stdout)["Stacks"][0]
    output = {v["OutputKey"]: v["OutputValue"] for v in stack.get("Outputs", [])}
    summary.update(applied=True, stack_status=stack["StackStatus"], outputs=output)
    private_json(directory / "deployment.json", summary)
    return summary


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("init", "plan", "apply"))
    parser.add_argument("--config", required=True)
    parser.add_argument("--evidence-dir")
    parser.add_argument("--origin", default=DEFAULT_ORIGIN)
    args = parser.parse_args()
    if args.command == "init":
        result = initialize(args.config, args.origin)
    elif not args.evidence_dir:
        parser.error("--evidence-dir is required")
    elif args.command == "plan":
        result = plan(args.config, args.evidence_dir)[2]
    else:
        result = apply(args.config, args.evidence_dir)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
