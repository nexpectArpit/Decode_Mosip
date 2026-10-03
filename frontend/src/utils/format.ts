export function formatCredentialTitle(type?: string): string {
  if (!type) return 'Verifiable Credential';
  if (type === 'NationalIdCredential' || type === 'NationalId') return 'National ID Credential';
  if (type === 'FarmerCredential') return 'Farmer Credential';
  if (type === 'MockMdl' || type === 'mso_mdoc' || type === 'MobileDrivingLicense') return 'Mobile Driving License (mDL)';
  
  return type
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .replace(/\bId\b/gi, 'ID')
    .trim();
}
