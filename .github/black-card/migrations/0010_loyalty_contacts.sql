-- One contact per email across both entry points. Promotional sends use email_opt_in = 1.
CREATE VIEW loyalty_contacts AS
SELECT s.email, s.name, coalesce(a.phone, s.phone) AS phone,
       a.id AS account_id, 1 AS email_opt_in, s.signed_up_at AS opted_in_at
FROM signups AS s LEFT JOIN loyalty_accounts AS a ON a.email = s.email
UNION ALL
SELECT a.email, a.name, a.phone, a.id, 0, NULL
FROM loyalty_accounts AS a
WHERE NOT EXISTS (SELECT 1 FROM signups AS s WHERE s.email = a.email);
