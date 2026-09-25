import sqlite3
from pathlib import Path

DB_NAME = "pantry.db"


def get_connection():
    connection = sqlite3.connect(DB_NAME)
    connection.row_factory = sqlite3.Row
    return connection


def create_tables():
    connection = get_connection()
    cursor = connection.cursor()

    # Existing pantry table — preserve existing data
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS pantry_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            quantity REAL NOT NULL,
            unit TEXT NOT NULL,
            expiry_date TEXT NOT NULL,
            minimum_quantity REAL NOT NULL
        )
    """)

    # Shopping list
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS shopping_list (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            item_name TEXT NOT NULL,
            quantity REAL,
            unit TEXT
        )
    """)

    # User accounts
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL
        )
    """)

    # Associate existing pantry items with accounts
    columns = [
        row["name"]
        for row in cursor.execute(
            "PRAGMA table_info(pantry_items)"
        ).fetchall()
    ]

    if "user_id" not in columns:
        cursor.execute("""
            ALTER TABLE pantry_items
            ADD COLUMN user_id INTEGER REFERENCES users(id)
        """)

    connection.commit()
    connection.close()


if __name__ == "__main__":
    create_tables()