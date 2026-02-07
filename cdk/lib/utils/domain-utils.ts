/**
 * Domain utility functions for handling FQDN-based domain construction
 */

export interface DomainParts {
  readonly subdomain?: string;
  readonly hostedZoneName: string;
}

/**
 * Splits an FQDN into subdomain and hosted zone name parts
 * @param fqdn - The fully qualified domain name (e.g., 'example.com', 'qa.example.com', 'jdoe.dev.example.com')
 * @returns Object with subdomain (optional) and hostedZoneName
 * 
 * Examples:
 * - splitFqdn('example.com') => { hostedZoneName: 'example.com' }
 * - splitFqdn('qa.example.com') => { subdomain: 'qa', hostedZoneName: 'example.com' }
 * - splitFqdn('jdoe.dev.example.com') => { subdomain: 'jdoe.dev', hostedZoneName: 'example.com' }
 */
export function splitFqdn(fqdn: string): DomainParts {
  if (!fqdn || !fqdn.trim()) {
    throw new Error('FQDN cannot be empty');
  }

  const parts = fqdn.trim().split('.');
  
  if (parts.length < 2) {
    throw new Error(`Invalid FQDN: ${fqdn}. Must have at least domain.tld format`);
  }

  // For simplicity, we assume the last two parts are the hosted zone (domain.tld)
  // and everything else is subdomain
  if (parts.length === 2) {
    // Root domain case: example.com
    return {
      hostedZoneName: fqdn,
    };
  } else {
    // Subdomain case: qa.example.com or jdoe.dev.example.com
    const hostedZoneName = parts.slice(-2).join('.');
    const subdomain = parts.slice(0, -2).join('.');
    return {
      subdomain,
      hostedZoneName,
    };
  }
}

export function buildApiDomainName(fqdn: string): string {
  return `api.${fqdn}`;
}

/**
 * Constructs a Route53 record name for API, handling empty subdomain cases
 * @param subdomain - The subdomain (can be empty string)
 * @returns Record name for Route53 (or undefined for root domain)
 * 
 * Examples:
 * - buildApiRecordName('') => 'api'
 * - buildApiRecordName('dev') => 'api.dev'
 */
export function buildApiRecordName(subdomain?: string): string {
  if (!subdomain || subdomain.trim() === '') {
    return 'api';
  }
  return `api.${subdomain}`;
}