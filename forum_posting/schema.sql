CREATE TABLE users (
    id serial PRIMARY KEY,
    username text NOT NULL UNIQUE,
    password text NOT NULL,
    is_admin BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE mystery (
    id serial PRIMARY KEY,
    title text NOT NULL UNIQUE,
    description text NOT NULL,
    author_id integer NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_author
        FOREIGN KEY (author_id)
        REFERENCES users(id)
        ON DELETE CASCADE
);

CREATE TABLE clues (
    id serial PRIMARY KEY,
    name text NOT NULL UNIQUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE mysteryClues (
    id serial PRIMARY KEY,
    mystery_id integer NOT NULL,
    clue_id integer NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    quantity text NOT NULL,
    CONSTRAINT fk_mystery
        FOREIGN KEY (mystery_id)
        REFERENCES mysterys(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_clue
        FOREIGN KEY (clue_id)
        REFERENCES clues(id)
        ON DELETE CASCADE,
    CONSTRAINT unique_mystery_clue UNIQUE (mystery_id, clue_id)
);

CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_modtime 
    BEFORE UPDATE ON users 
    FOR EACH ROW 
    EXECUTE FUNCTION update_modified_column();

CREATE TRIGGER update_mysterys_modtime 
    BEFORE UPDATE ON mysterys 
    FOR EACH ROW 
    EXECUTE FUNCTION update_modified_column();

CREATE TRIGGER update_clues_modtime 
    BEFORE UPDATE ON clues 
    FOR EACH ROW 
    EXECUTE FUNCTION update_modified_column();

CREATE TRIGGER update_mystery_clues_modtime 
    BEFORE UPDATE ON mysteryclues 
    FOR EACH ROW 
    EXECUTE FUNCTION update_modified_column();
