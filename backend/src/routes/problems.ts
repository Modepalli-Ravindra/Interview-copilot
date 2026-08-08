import { Router, Request, Response } from 'express';

const router = Router();

interface Problem {
  id: string;
  title: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  tags: string[];
  acceptance: number;
  minutes: number;
  statement: string;
  testCases: { stdin: string; expected: string }[];
}

const PROBLEMS: Problem[] = [
  {
    id: 'two-sum',
    title: 'Two Sum',
    difficulty: 'Easy',
    tags: ['Arrays', 'Hash Map'],
    acceptance: 86,
    minutes: 15,
    statement: `## Two Sum\n\nGiven an array of integers \`nums\` and an integer \`target\`, return indices of the two numbers such that they add up to \`target\`.\n\n**Input format:** first line two integers \`n\` and \`target\`, second line \`n\` integers.\n**Output:** the two 0-based indices, space-separated.\n\n**Example:**\n- Input: \`4 9\` / \`2 7 11 15\` → Output: \`0 1\`\n\n**Constraints:**\n- 2 ≤ n ≤ 10⁴\n- Only one valid answer exists\n\n**Follow-up:** Can you achieve O(n) time?`,
    testCases: [
      { stdin: '4 9\n2 7 11 15', expected: '0 1' },
      { stdin: '3 6\n3 2 4', expected: '1 2' },
      { stdin: '2 6\n3 3', expected: '0 1' },
      { stdin: '5 10\n1 5 2 8 2', expected: '1 3' },
    ],
  },
  {
    id: 'valid-parentheses',
    title: 'Valid Parentheses',
    difficulty: 'Easy',
    tags: ['Stack', 'Strings'],
    acceptance: 81,
    minutes: 12,
    statement: `## Valid Parentheses\n\nGiven a string \`s\` containing just \`(\`, \`)\`, \`{\`, \`}\`, \`[\` and \`]\`, determine if the input string is valid.\n\n**Input format:** one line, the string.\n**Output:** \`true\` or \`false\`.\n\n**Example:**\n- Input: \`()[]{}\` → Output: \`true\`\n- Input: \`([)]\` → Output: \`false\`\n\n**Follow-up:** What is the space complexity of your stack solution?`,
    testCases: [
      { stdin: '()[]{}', expected: 'true' },
      { stdin: '([)]', expected: 'false' },
      { stdin: '((()))', expected: 'true' },
      { stdin: '(]', expected: 'false' },
      { stdin: '', expected: 'true' },
    ],
  },
  {
    id: 'lru-cache',
    title: 'LRU Cache',
    difficulty: 'Medium',
    tags: ['Design', 'Hash Map', 'Doubly Linked List'],
    acceptance: 74,
    minutes: 30,
    statement: `## LRU Cache\n\nDesign a data structure that follows the constraints of a Least Recently Used (LRU) cache.\n\nImplement \`get(key)\` and \`put(key, value)\`. Both must run in \`O(1)\` average time.\n\n**Example:**\n- cap = 2, put(1,1), put(2,2), get(1) → 1, put(3,3) → evicts key 2\n\n**Follow-up:** Explain how you'd make this thread-safe.`,
    testCases: [],
  },
  {
    id: 'course-schedule',
    title: 'Course Schedule',
    difficulty: 'Medium',
    tags: ['Graph', 'Topological Sort'],
    acceptance: 68,
    minutes: 30,
    statement: `## Course Schedule\n\nThere are \`numCourses\` courses labeled from \`0\` to \`numCourses - 1\`. You are given \`prerequisites\` where \`prerequisites[i] = [a, b]\` means you must take course \`b\` before course \`a\`. Return \`true\` if you can finish all courses.\n\n**Input format:** first line \`numCourses n\` and \`m\` (number of edges), next \`m\` lines each with two integers.\n**Output:** \`true\` or \`false\`.\n\n**Follow-up:** Return a valid topological ordering.`,
    testCases: [
      { stdin: '2 1\n1 0', expected: 'true' },
      { stdin: '2 2\n1 0\n0 1', expected: 'false' },
      { stdin: '4 4\n1 0\n2 0\n3 1\n3 2', expected: 'true' },
    ],
  },
  {
    id: 'median-two-sorted',
    title: 'Median of Two Sorted Arrays',
    difficulty: 'Hard',
    tags: ['Binary Search', 'Divide & Conquer'],
    acceptance: 61,
    minutes: 40,
    statement: `## Median of Two Sorted Arrays\n\nGiven two sorted arrays \`nums1\` and \`nums2\`, return the median of the two sorted arrays. Must run in \`O(log(m + n))\`.\n\n**Input format:** first line \`m n\`, second line \`m\` integers, third line \`n\` integers.\n**Output:** the median value.\n\n**Hint:** Binary search the smaller array for the correct partition.`,
    testCases: [
      { stdin: '2 1\n1 3\n2', expected: '2.0' },
      { stdin: '2 2\n1 2\n3 4', expected: '2.5' },
      { stdin: '0 1\n\n5', expected: '5.0' },
    ],
  },
];

router.get('/', (_req: Request, res: Response) => {
  res.json({ success: true, data: PROBLEMS, count: PROBLEMS.length });
});

export default router;
