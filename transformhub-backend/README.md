docker logs -f transformhub-backend-prod

  1. 目标约束
  2. 单一数据源
  3. 验收标准
  4. 再开始改

  To clear all seeded identity memory and all permanent person-match decisions:

  docker exec -it flexforge-db-prod psql -U flexforge -d transformhub_prod -c "TRUNCATE TABLE th_identity_memory RESTART IDENTITY CASCADE; DELETE
  FROM th_audit_decisions WHERE permanent = true;"

  If you want to clear only donor-related seeded people and decisions instead of everything:

  docker exec -it flexforge-db-prod psql -U flexforge -d transformhub_prod -c "DELETE FROM th_identity_memory WHERE source_file_class = 'donor';
  DELETE FROM th_audit_decisions WHERE permanent = true AND file_class = 'donor';"
  

1. Check pending review decisions (after migrations run):
  docker exec flexforge-db-prod psql -U flexforge -d transformhub_prod -c 'SELECT id, "inputKey", "candidatePersonId", score, "isHighConfidence","confirmationCount",
  "isDriftAlert", status, "createdAt", "resolvedAt" FROM public.th_review_queue_items ORDER BY "createdAt" DESC LIMIT 20;'

  2. Check permanent merge/split decisions (exist now):
  docker exec flexforge-db-prod psql -U flexforge -d transformhub_prod -c 'SELECT id, "inputKey", "matchedPersonId", merge, split, permanent, 
  "confirmationCount", "createdAt" FROM public.th_audit_decisions WHERE permanent = true ORDER BY "createdAt" DESC LIMIT 20;' 

  3. Check session-scoped decisions (expire with session):
  docker exec flexforge-db-prod psql -U flexforge -d transformhub_prod -c 'SELECT id, "sessionId", "inputKey", merge, split, permanent, "createdAt" FROM
  public.th_audit_decisions WHERE permanent = false ORDER BY "createdAt" DESC LIMIT 20;'

  4. Run pending migrations first (new tables don't exist yet):
  docker exec transformhub-backend-prod sh -c 'npm run migration:run'
  # or
  docker exec transformhub-backend-prod sh -c 'npx typeorm migration:run -d dist/database/data-source.js'