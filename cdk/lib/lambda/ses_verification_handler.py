import boto3
import logging
from typing import Dict, Any

logger = logging.getLogger()
logger.setLevel(logging.INFO)

def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Custom resource handler for SES domain verification.
    """
    try:
        request_type = event['RequestType']
        props = event['ResourceProperties']
        domain_name = props['DomainName']
        hosted_zone_id = props['HostedZoneId']
        region = props['Region']
        
        logger.info(f"Processing {request_type} for domain {domain_name} in region {region}")
        
        if request_type == 'Create' or request_type == 'Update':
            return create_or_update_verification(domain_name, hosted_zone_id, region)
        elif request_type == 'Delete':
            return delete_verification(domain_name, hosted_zone_id, region)
        else:
            raise ValueError(f"Unknown request type: {request_type}")
            
    except Exception as e:
        logger.error(f"Error processing request: {str(e)}")
        raise

def create_or_update_verification(domain_name: str, hosted_zone_id: str, region: str) -> Dict[str, Any]:
    """Create or update SES verification records."""
    ses_client = boto3.client('ses', region_name=region)
    route53_client = boto3.client('route53')
    
    try:
        # Start domain verification to get the token
        response = ses_client.verify_domain_identity(Domain=domain_name)
        verification_token = response['VerificationToken']
        
        logger.info(f"Got verification token: {verification_token}")
        
        # Create the TXT record for domain verification
        record_name = f"_amazonses.{domain_name}"
        
        change_batch = {
            'Changes': [{
                'Action': 'UPSERT',
                'ResourceRecordSet': {
                    'Name': record_name,
                    'Type': 'TXT',
                    'TTL': 300,
                    'ResourceRecords': [{'Value': f'"{verification_token}"'}]
                }
            }]
        }
        
        route53_response = route53_client.change_resource_record_sets(
            HostedZoneId=hosted_zone_id,
            ChangeBatch=change_batch
        )
        
        change_id = route53_response['ChangeInfo']['Id']
        logger.info(f"Created verification record with change ID: {change_id}")
        
        return {
            'PhysicalResourceId': f"ses-verification-{domain_name}",
            'Data': {
                'VerificationToken': verification_token,
                'RecordName': record_name,
                'ChangeId': change_id
            }
        }
        
    except Exception as e:
        logger.error(f"Failed to create verification record: {str(e)}")
        raise

def delete_verification(domain_name: str, hosted_zone_id: str, region: str) -> Dict[str, Any]:
    """Clean up verification records on stack deletion."""
    route53_client = boto3.client('route53')
    
    try:
        # Get existing TXT record
        record_name = f"_amazonses.{domain_name}"
        
        response = route53_client.list_resource_record_sets(
            HostedZoneId=hosted_zone_id,
            StartRecordName=record_name,
            StartRecordType='TXT'
        )
        
        # Find and delete the verification record
        for record_set in response['ResourceRecordSets']:
            if record_set['Name'].rstrip('.') == record_name and record_set['Type'] == 'TXT':
                change_batch = {
                    'Changes': [{
                        'Action': 'DELETE',
                        'ResourceRecordSet': record_set
                    }]
                }
                
                route53_client.change_resource_record_sets(
                    HostedZoneId=hosted_zone_id,
                    ChangeBatch=change_batch
                )
                
                logger.info(f"Deleted verification record: {record_name}")
                break
        
        return {
            'PhysicalResourceId': f"ses-verification-{domain_name}"
        }
        
    except Exception as e:
        logger.error(f"Error during cleanup: {str(e)}")
        # Don't fail deletion on cleanup errors
        return {
            'PhysicalResourceId': f"ses-verification-{domain_name}"
        }