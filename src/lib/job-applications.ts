import type { JobApplication } from "@/lib/types";

export const platformOptions = ["Linkedin", "Indeed", "Jobright", "Dice"] as const;

export const stackOptions = [
  "Python",
  "Java",
  "Data",
  "Ruby",
  "Rust/Scala",
  "C#",
  "PHP/Laravel",
  "Node.js",
  "Go/Golang",
] as const;

export const statusOptions = ["Applied", "Failed"] as const;

export function createBlankRow(id: number): JobApplication {
  return {
    id,
    platform: "Linkedin",
    company: "",
    description: "",
    url: "",
    stack: "",
    status: "",
  };
}

export function createInitialRows() {
  return Array.from({ length: 100 }, (_, index) => createBlankRow(index + 1));
}
