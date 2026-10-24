-- The upstream FarmerCredential template references these fields, but the
-- bundled credential_subject metadata advertises only four claims (including
-- "phone" where the template uses "mobileNumber"). PreAuthDataProviderPlugin
-- rejects the missing fields as unknown_claims, leaving signed templates with
-- unresolved ${...} values. Extend the demo configuration idempotently.
\connect inji_certify
UPDATE certify.credential_config AS config
SET credential_subject = config.credential_subject || (
  SELECT jsonb_object_agg(claim_name, jsonb_build_object(
    'display', jsonb_build_array(jsonb_build_object('name', claim_name, 'locale', 'en'))
  ))
  FROM unnest(ARRAY[
    'id', 'mobileNumber', 'state', 'district', 'villageOrTown',
    'postalCode', 'landArea', 'landOwnershipType', 'primaryCropType',
    'secondaryCropType', 'face', 'farmerID'
  ]) AS claim_name
)
WHERE credential_config_key_id = 'FarmerCredential';
