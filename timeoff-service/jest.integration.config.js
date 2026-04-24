module.exports = {
  moduleFileExtensions: ["js", "json", "ts"],
  rootDir: ".",
  testMatch: ["**/test/integration/**/*.spec.ts"],
  transform: { "^.+\\.(t|j)s$": "ts-jest" },
  testEnvironment: "node",
  collectCoverage: false,
  globals: {
    "ts-jest": { tsconfig: "tsconfig.json" }
  }
};
