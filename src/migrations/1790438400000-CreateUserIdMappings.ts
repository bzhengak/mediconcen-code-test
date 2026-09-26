import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUserIdMappings1790438400000 implements MigrationInterface {
  name = 'CreateUserIdMappings1790438400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`user_id_mappings\` (
        \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`id1\` VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin NOT NULL,
        \`id2\` VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin NOT NULL,
        \`user_id\` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`uk_id1_id2\` (\`id1\`, \`id2\`),
        UNIQUE INDEX \`uk_user_id\` (\`user_id\`)
      ) ENGINE = InnoDB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `user_id_mappings`');
  }
}
