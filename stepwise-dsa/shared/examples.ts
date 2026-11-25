export const examples = [
  {
    title: "Two Sum",
    pattern: "Hashing",
    problem:
      "Given an array nums and a target, return the indices of two distinct elements whose sum equals target. Exactly one pair exists. Example: nums=[2,7,11,15], target=9 returns [0,1].",
    code: `def two_sum(nums, target):
    seen = {}
    for i, value in enumerate(nums):
        complement = target - value
        if complement in seen:
            return [seen[complement], i]
        seen[value] = i
    return []`,
  },
  {
    title: "Binary Search",
    pattern: "Binary Search",
    problem:
      "Given a sorted ascending array nums and target, return its index or -1 if absent. Example nums=[1,3,5,7,9], target=7 returns 3.",
    code: `def binary_search(nums, target):
    left, right = 0, len(nums) - 1
    while left <= right:
        mid = (left + right) // 2
        if nums[mid] == target:
            return mid
        if nums[mid] < target:
            left = mid + 1
        else:
            right = mid - 1
    return -1`,
  },
  {
    title: "Climbing Stairs",
    pattern: "Dynamic Programming",
    problem:
      "You climb n stairs, taking 1 or 2 steps at a time. Return the number of distinct ways for 1 <= n <= 45. Example n=5 returns 8.",
    code: `def climb_stairs(n):
    previous, current = 1, 1
    for step in range(2, n + 1):
        previous, current = current, previous + current
    return current`,
  },
];
