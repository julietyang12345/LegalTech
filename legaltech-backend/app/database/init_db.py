from pathlib import Path

from app.database.connection import connection


def initialize_database() -> None:
    schema_path = Path(__file__).with_name("schema.sql")
    schema = schema_path.read_text(encoding="utf-8")
    with connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(schema)
        conn.commit()
    print(f"Initialized PostgreSQL schema from {schema_path}")


if __name__ == "__main__":
    initialize_database()
