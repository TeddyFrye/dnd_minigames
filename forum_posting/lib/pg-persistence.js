const { dbQuery } = require("./db-query");

class PgPersistence {
  constructor(session) {
    this.session = session;
  }

  async getAllRecipes() {
    return await dbQuery("SELECT * FROM recipes");
  }

  async deleteRecipe(recipeId) {
    try {
      await dbQuery("BEGIN");
      console.log("Transaction started");

      await dbQuery("DELETE FROM recipeIngredients WHERE recipe_id = $1", [
        recipeId,
      ]);
      console.log("Deleted ingredients for recipe", recipeId);

      const result = await dbQuery(
        "DELETE FROM recipes WHERE id = $1 RETURNING id",
        [recipeId]
      );
      console.log("Deleted recipe", recipeId);

      await dbQuery("COMMIT");
      console.log("Transaction committed");

      return result.rows.length > 0;
    } catch (error) {
      await dbQuery("ROLLBACK");
      console.error("Error deleting recipe, transaction rolled back:", error);
      throw error;
    }
  }
}

module.exports = PgPersistence;
