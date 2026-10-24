\connect inji_certify
UPDATE certify.credential_config
SET did_url = :'public_did'
WHERE credential_config_key_id = 'FarmerCredential'
  AND did_url IS DISTINCT FROM :'public_did';
