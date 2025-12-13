SELECT "callId", COUNT(*) AS cnt
FROM "CallTask"
GROUP BY "callId"
HAVING COUNT(*) > 1
ORDER BY cnt DESC;
