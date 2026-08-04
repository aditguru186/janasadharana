-- Must be its own transaction: new enum values cannot be used until committed.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'grievance_category'
      AND e.enumlabel = 'cow_welfare'
  ) THEN
    ALTER TYPE grievance_category ADD VALUE 'cow_welfare';
  END IF;
END
$$;
