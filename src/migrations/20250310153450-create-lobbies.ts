import { QueryInterface, DataTypes, Sequelize } from 'sequelize';
import { LobbyStatusValues, LobbyStatus } from '../enums/lobbyStatus';

module.exports = {
  async up(queryInterface: QueryInterface, sequelize: typeof Sequelize) {
    await queryInterface.createTable("lobbies", {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      player1Id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "users", key: "id" },
        onDelete: "CASCADE",
      },
      player2Id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "users", key: "id" },
        onDelete: "CASCADE",
      },
      winnerId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "users", key: "id" },
        onDelete: "SET NULL",
      },
      uuid: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      status: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: LobbyStatus.STARTED,
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: sequelize.fn("NOW"),
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: sequelize.fn("NOW"),
      },
    });

    await queryInterface.addIndex("lobbies", ["uuid"], {
      unique: true,
      name: "lobbies_uuid_unique"
    });
  },

  async down(queryInterface: QueryInterface) {
    await queryInterface.dropTable("lobbies");
  }
};
