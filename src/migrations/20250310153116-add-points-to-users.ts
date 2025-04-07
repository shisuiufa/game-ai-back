import {QueryInterface,DataTypes, Sequelize} from "sequelize";

module.exports = {
  async up (queryInterface: QueryInterface, sequelize: typeof Sequelize) {
    await queryInterface.addColumn("users", "points", {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });
  },

  async down (queryInterface: QueryInterface, sequelize: typeof Sequelize) {
    await queryInterface.removeColumn("users", "points");
  }
};
