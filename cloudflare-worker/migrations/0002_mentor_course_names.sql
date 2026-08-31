INSERT INTO schedule_document_state (id, revision, updated_at, document_json)
SELECT
  1,
  revision + 1,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  json_object(
    'courses', json(courses_json),
    'trash', json('[]'),
    'mentorCourseNames', json_array(
      '设施农业与装备',
      '设施农业与装备（专硕）',
      '农业节水与供水工程'
    )
  )
FROM schedule_state
WHERE id = 1
  AND NOT EXISTS (SELECT 1 FROM schedule_document_state WHERE id = 1);
