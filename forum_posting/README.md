## PROJECT DESCRIPTION

This is a project for creating and storing recipes, as well as sharing with other users. Users can create recipes out of existing ingredients, customizing their quantity for each recipe.

If a user is an admin, then they are also able to edit, add, and delete ingredients.

## DEPENDENCIES

Node version: `v21.5.0`
npm version: `10.8.3`
PostgreSQL version: `psql (PostgreSQL) 14.13 (Homebrew)`
Tested on Browser: `Google Chrome Version 129.0.6668.60 (Official Build) (x86_64)`

## STARTING THE SERVER

Install node, npm, and postgreSQL. Then run:

```bash
npm install -d
npm start
```

## NEW INSTRUCTIONS FOR SETUP

Edit the .env file so that `DB_USER` is now your username in postgreSQL.

```
DB_USER=your_postgres_username
```

Note that the .env file may appear hidden in your file explorer, and will have to be revealed in a way dependent on your system (e.g. CMD+i on Mac, File Explorer Advanced Setting on Windows 10)

## CREATING THE DATABASE IN POSTGRESQL

Enter the following commands into your terminal from the project root:

```bash
createdb recipe_database;
psql -d recipe_database -f schema.sql;
psql -d recipe_database -f lib/seed-data.sql;
psql -d recipe_database;
```

## NOTES ON CRUD

In order to edit an ingredient's quantity in a recipe, go to the recipe page, click "Edit Recipe." Select the ingredient you want to edit from the dropdown under "Add new ingredient." Enter the new quantity and click "Add Ingredient," then "Save Changes."

Deleting an ingredient from a recipe does not remove it from the database. Deleting an ingredient from the database via "Manage Ingredients" will remove it from all recipes it exists within.

The search function allows you to search within recipe names and descriptions, ingredient names, or even recipes via their ingredient.

## LOGIN & REGISTRATION

In order to register a new admin account, enter "LaunchSchool" into the admin password field. This is separate from your account password.
The database starts with 2 accounts, a user and an admin:

username: `user1`
password: `1234`

username: `admin1`
password: `12345`
