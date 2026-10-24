// Pinned public context referenced by the bundled FarmerCredential seed.
// Source: https://piyush7034.github.io/my-files/farmer.json (retrieved 2026-10-20).
export const FARMER_CONTEXT_URL = 'https://piyush7034.github.io/my-files/farmer.json';

export const FARMER_CONTEXT = {
  '@context': {
    '@version': 1.1,
    '@protected': true,
    type: '@type',
    schema: 'https://schema.org/',
    FarmerCredential: { '@id': `${FARMER_CONTEXT_URL}#FarmerCredential` },
    fullName: 'schema:name',
    mobileNumber: 'schema:telephone',
    dateOfBirth: 'schema:birthDate',
    gender: 'schema:gender',
    state: 'schema:addressRegion',
    district: 'schema:addressLocality',
    villageOrTown: 'schema:addressLocality',
    postalCode: 'schema:postalCode',
    landArea: 'schema:Number',
    landOwnershipType: 'schema:Text',
    primaryCropType: 'schema:Text',
    secondaryCropType: 'schema:Text',
    face: 'schema:Text',
    farmerID: 'schema:Text'
  }
};
