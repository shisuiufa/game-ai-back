'use strict';
const { DataTypes } = require("sequelize");

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.addColumn("lobbies", "uuid", {
      type: DataTypes.UUID,
      allowNull: false,
    });
    await queryInterface.addIndex("lobbies", ["uuid"], {
      unique: true,
      name: "lobbies_uuid_unique"
    });
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.removeIndex("lobbies", "lobbies_uuid_unique");

    // Удаляем колонку uuid
    await queryInterface.removeColumn("lobbies", "uuid");
  }
};
