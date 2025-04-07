'use strict';

import {DataTypes, QueryInterface, Sequelize} from "sequelize";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface: QueryInterface, sequelize: typeof Sequelize) {
    await queryInterface.createTable('tasks', {
      id: {
        type: DataTypes.BIGINT,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      lobbyId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'lobbies', key: 'id' },
        onDelete: 'CASCADE',
      },
      prompt: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: sequelize.fn('NOW'),
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: sequelize.fn('NOW'),
      },
    });
  },

  async down (queryInterface: QueryInterface, sequelize: typeof Sequelize) {
    await queryInterface.dropTable('tasks');
  }
};
