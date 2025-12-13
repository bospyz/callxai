SELECT "companyId", "amoUserId", COUNT(*) AS cnt
FROM "Manager"
WHERE "amoUserId" IS NOT NULL
GROUP BY "companyId", "amoUserId"
HAVING COUNT(*) > 1
ORDER BY cnt DESC;
