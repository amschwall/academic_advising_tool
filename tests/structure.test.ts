// file: tests/structure.test.ts

import fs from "fs";
import path from "path";

/**
 * These tests verify that the expected project structure exists.
 * They will fail until the directories and files are created —
 * that is intentional under TDD.
 */

const projectRoot = path.resolve(__dirname, "..");

function exists(relativePath: string): boolean {
  return fs.existsSync(path.join(projectRoot, relativePath));
}

describe("Project structure", () => {
  describe("Required directories", () => {
    const requiredDirs = [
      "app",
      "lib",
      "tests",
    ];

    for (const dir of requiredDirs) {
      it(`directory /${dir} exists`, () => {
        expect(exists(dir)).toBe(true);
      });
    }
  });

  describe("Required files", () => {
    const requiredFiles = [
      "lib/db.ts",
      "lib/env.ts",
      "app/api/health/route.ts",
    ];

    for (const file of requiredFiles) {
      it(`file /${file} exists`, () => {
        expect(exists(file)).toBe(true);
      });
    }
  });

  describe("Configuration files", () => {
    const configFiles = [
      "package.json",
      "tsconfig.json",
      "next.config.js",
      "tailwind.config.ts",
      "prisma/schema.prisma",
      ".env.test",
    ];

    for (const file of configFiles) {
      it(`config file /${file} exists`, () => {
        expect(exists(file)).toBe(true);
      });
    }
  });

  describe("Required file headers", () => {
    it("lib/db.ts begins with the correct file header comment", () => {
      const filePath = path.join(projectRoot, "lib/db.ts");
      if (!fs.existsSync(filePath)) {
        // File doesn't exist yet — test will fail structurally above; skip content check
        expect(fs.existsSync(filePath)).toBe(true);
        return;
      }
      const contents = fs.readFileSync(filePath, "utf-8");
      expect(contents.trimStart()).toMatch(/^\/\/ file: lib\/db\.ts/);
    });

    it("lib/env.ts begins with the correct file header comment", () => {
      const filePath = path.join(projectRoot, "lib/env.ts");
      if (!fs.existsSync(filePath)) {
        expect(fs.existsSync(filePath)).toBe(true);
        return;
      }
      const contents = fs.readFileSync(filePath, "utf-8");
      expect(contents.trimStart()).toMatch(/^\/\/ file: lib\/env\.ts/);
    });

    it("app/api/health/route.ts begins with the correct file header comment", () => {
      const filePath = path.join(projectRoot, "app/api/health/route.ts");
      if (!fs.existsSync(filePath)) {
        expect(fs.existsSync(filePath)).toBe(true);
        return;
      }
      const contents = fs.readFileSync(filePath, "utf-8");
      expect(contents.trimStart()).toMatch(/^\/\/ file: app\/api\/health\/route\.ts/);
    });
  });
});
