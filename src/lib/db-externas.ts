import type { FirebirdOptions } from './firebird';
import type { MySQLExtOptions } from './mysql-ext';

export const fbSJC: FirebirdOptions = {
  host: process.env.DB_SJC_HOST!,
  port: parseInt(process.env.DB_SJC_PORT || '3050'),
  database: process.env.DB_SJC_DATABASE!,
  user: process.env.DB_SJC_USER!,
  password: process.env.DB_SJC_PASSWORD!,
};

// SPM usa o banco MG
export const fbSPM: FirebirdOptions = {
  host: process.env.DB_MG_HOST!,
  port: parseInt(process.env.DB_MG_PORT || '3050'),
  database: process.env.DB_MG_DATABASE!,
  user: process.env.DB_MG_USER!,
  password: process.env.DB_MG_PASSWORD!,
};

export const fbLockeyMG: FirebirdOptions = {
  host: process.env.DB_LOCKEY_MG_HOST!,
  port: parseInt(process.env.DB_LOCKEY_MG_PORT || '3050'),
  database: process.env.DB_LOCKEY_MG_DATABASE!,
  user: process.env.DB_LOCKEY_MG_USER!,
  password: process.env.DB_LOCKEY_MG_PASSWORD!,
};

// Lockey SP + FAST (mesma base, separados por emp_fil_codigo)
export const fbLockey: FirebirdOptions = {
  host: process.env.DB_LOCKEY_HOST!,
  port: parseInt(process.env.DB_LOCKEY_PORT || '3050'),
  database: process.env.DB_LOCKEY_DATABASE!,
  user: process.env.DB_LOCKEY_USER!,
  password: process.env.DB_LOCKEY_PASSWORD!,
};

export const myLockeyRS: MySQLExtOptions = {
  host: process.env.MYSQL_POA_HOST!,
  port: parseInt(process.env.MYSQL_POA_PORT || '3377'),
  database: process.env.MYSQL_POA_DATABASE!,
  user: process.env.MYSQL_POA_USER!,
  password: process.env.MYSQL_POA_PASSWORD!,
};

export const myNiteroi: MySQLExtOptions = {
  host: process.env.MYSQL_NITEROI_HOST!,
  port: parseInt(process.env.MYSQL_NITEROI_PORT || '3377'),
  database: process.env.MYSQL_NITEROI_DATABASE!,
  user: process.env.MYSQL_NITEROI_USER!,
  password: process.env.MYSQL_NITEROI_PASSWORD!,
};

export const fbLockeyRJ: FirebirdOptions = {
  host: process.env.DB_LOCKEY_RJ_HOST!,
  port: parseInt(process.env.DB_LOCKEY_RJ_PORT || '3050'),
  database: process.env.DB_LOCKEY_RJ_DATABASE!,
  user: process.env.DB_LOCKEY_RJ_USER!,
  password: process.env.DB_LOCKEY_RJ_PASSWORD!,
};

export const fbLockeyBH: FirebirdOptions = {
  host: process.env.DB_LOCKEY_BH_HOST!,
  port: parseInt(process.env.DB_LOCKEY_BH_PORT || '3050'),
  database: process.env.DB_LOCKEY_BH_DATABASE!,
  user: process.env.DB_LOCKEY_BH_USER!,
  password: process.env.DB_LOCKEY_BH_PASSWORD!,
};
