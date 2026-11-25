import { samples } from "@/lib/samples";
import type { Domain, Subproblem } from "@/types";

type Draft = Omit<Subproblem, "id" | "order" | "status" | "type" | "prerequisiteIds">;
function step(title: string, question: string, concept: string, answer: string, clue: string, stronger: string, worked: string, kind: "math" | "exact" = "math"): Draft {
  return { title, question, concept, expectedAnswerHint: answer, verifier: { kind, payload: answer }, guidance: [clue, stronger, worked] };
}

const lessons: Record<string, { steps: Draft[]; answer: string }> = {
  notebooks: {
    steps: [
      step("Write a cost equation", "Let x be the price of one notebook. Write an equation for the total cost.", "Representing a total", "3x+2=17", "Which cost repeats for each notebook?", "Multiply x by the notebook count, then include the fixed pen cost.", "Three notebooks cost 3x and the pen adds 2, so 3x + 2 = 17."),
      step("Remove the fixed cost", "How much do the three notebooks cost together?", "Subtracting a fixed cost", "15", "Separate the price of the pen from the bundle total.", "Subtract the pen's price from the total paid.", "The notebooks cost $17 − $2 = $15 together."),
      step("Find the unit price", "How much does one notebook cost? Enter a number.", "Finding a unit price", "5", "Each notebook accounts for an equal share of the subtotal.", "Divide the subtotal by the number of notebooks.", "Divide $15 by 3 to get $5 per notebook."),
      step("Check against the total", "Using your unit price, what total do three notebooks and the pen give?", "Checking by substitution", "17", "Rebuild the bundle with the unit price you found.", "Multiply the unit price by 3 and add the pen cost.", "3 × $5 + $2 = $17, which matches the stated total."),
    ],
    answer: "Let x be the notebook price. The total gives 3x + 2 = 17. Subtract 2 to get 3x = 15, then divide by 3. Each notebook costs $5. The check is 3 × $5 + $2 = $17.",
  },
  tickets: {
    steps: [
      step("Express the adult price", "Let c be the child ticket price. What expression gives the adult price?", "Translating a price difference", "c+4", "Start with the child price.", "The adult price includes an extra fixed amount.", "The adult ticket costs c + 4."),
      step("Write the total equation", "Write an equation in c for one adult ticket and two child tickets.", "Combining prices", "3c+4=25", "Count all tickets represented by the base child price.", "Add one adult expression and twice the child price, then set the sum equal to the total.", "The total gives (c + 4) + 2c = 25, or 3c + 4 = 25."),
      step("Find the child price", "How much is the child ticket? Enter a number.", "Solving a linear equation", "7", "Reverse the operations in the equation.", "Remove the fixed difference from the total before dividing.", "Subtract 4 from 25 and divide by 3, giving $7."),
      step("Find the adult price", "How much is the adult ticket? Enter a number.", "Substituting into an expression", "11", "Use the price difference stated in the question.", "Add the fixed difference to your child ticket price.", "The adult ticket costs $7 + $4 = $11."),
    ],
    answer: "If c is the child price, the adult price is c + 4. One adult and two children give 3c + 4 = 25. Thus c = 7, so the child ticket costs $7 and the adult ticket costs $11.",
  },
  loop: {
    steps: [
      step("Read the first condition", "When n is 2, what is the value of n % 2?", "Modulo", "0", "Modulo gives the remainder after division.", "Divide the first value by 2 and look at what is left over.", "The remainder of 2 divided by 2 is 0."),
      step("Trace the first update", "What is total immediately after the iteration with n = 2?", "Accumulator updates", "2", "Check whether the condition was true for the first value.", "When the condition passes, add n to the running total.", "The condition passes, so total becomes 0 + 2 = 2."),
      step("Trace the odd value", "What is total immediately after the iteration with n = 5?", "Conditional execution", "2", "Recompute the remainder for this iteration.", "The accumulator changes only if the remainder equals zero.", "5 is odd, so the body is skipped and total stays 2."),
      step("Read the output", "What number does print(total) display?", "Final loop state", "10", "There is one value left after the odd one.", "Check whether 8 passes the condition and update the saved total if it does.", "8 is even, so the final total is 2 + 8 = 10."),
    ],
    answer: "The loop adds 2, skips 5 because it is odd, and adds 8. The program prints 10.",
  },
  swap: {
    steps: [
      step("Follow the swap", "What is a immediately after a, b = b, a?", "Simultaneous assignment", "7", "Read both right-hand values before updating either variable.", "The first target takes the old value of the first expression on the right.", "The right side is (7, 3), so a becomes 7."),
      step("Update the second variable", "What is b after b = b + 2?", "State after reassignment", "5", "Track the old a through the swap.", "Use the swapped value of b as the input to addition.", "The swap sets b to 3, then b + 2 sets it to 5."),
      step("Evaluate the print expression", "What number is printed?", "Evaluating the final state", "12", "The print statement uses the final values.", "Add the current a and b values.", "The program prints 7 + 5 = 12."),
    ],
    answer: "The swap sets a = 7 and b = 3. The next line sets b = 5. The program prints 12.",
  },
  binary: {
    steps: [
      step("Locate the first midpoint", "What zero-based index do you examine first?", "Midpoint selection", "2", "The first and last indices are your initial bounds.", "Average the two bounds and round down.", "With bounds 0 and 5, the midpoint is floor(5 / 2) = 2."),
      step("Narrow the interval", "What is the new lower index bound after comparing the midpoint value to 13?", "Discarding the lower half", "3", "Compare the value at the midpoint with the target.", "When the midpoint is too small, move the lower bound one position above it.", "Index 2 contains 8. Since 8 < 13, the lower bound becomes 3."),
      step("Locate the next midpoint", "What index do you examine with the updated bounds?", "Recomputing the midpoint", "4", "The upper bound has stayed fixed so far.", "Average your updated lower bound and 5, then round down.", "The midpoint of indices 3 and 5 is 4."),
      step("Identify the matching index", "After comparing the last midpoint with 13, which index remains and matches the target?", "Discarding the upper half", "3", "The midpoint value is greater than the target.", "Move the upper bound one position below the midpoint, then inspect the remaining index.", "Index 4 contains 21, so the upper bound becomes 3. At index 3 the array contains 13."),
    ],
    answer: "The first midpoint is 2 (value 8), so search indices 3–5. The next midpoint is 4 (value 21), so search index 3. That index contains 13.",
  },
  sort: {
    steps: [
      step("Insert the second value", "What is the full array after inserting 2 into the sorted prefix? Enter comma-separated values.", "Shifting a larger element", "2,4,5,1", "Compare 2 with its immediate predecessor.", "Shift 4 one place right to make room for 2.", "Inserting 2 before 4 gives [2, 4, 5, 1].", "exact"),
      step("Insert the third value", "What is the full array after inserting 5? Enter comma-separated values.", "Extending the sorted prefix", "2,4,5,1", "The existing sorted prefix contains two values.", "If 5 is greater than its predecessor, it stays where it is.", "5 is greater than 4, so the array stays [2, 4, 5, 1].", "exact"),
      step("Insert the last value", "What is the full array after inserting 1? Enter comma-separated values.", "Shifting across the prefix", "1,2,4,5", "Scan the sorted prefix from right to left.", "Shift each value that is larger than 1 one position to the right.", "All three prefix values shift right, giving [1, 2, 4, 5].", "exact"),
    ],
    answer: "After inserting 2: [2, 4, 5, 1]. After inserting 5: [2, 4, 5, 1]. After inserting 1: [1, 2, 4, 5].",
  },
};

export class MockProvider {
  lesson(text: string, domain: Domain) {
    const sample = samples.find(item => item.text === text && item.domain === domain);
    return sample ? lessons[sample.id] : undefined;
  }

  practice(domain: Domain): Draft[] {
    const tasks = {
      math: ["Name a variable for the unknown quantity.", "Write an equation that relates your variable to the given quantities.", "Solve the equation and check the result against the problem."],
      programming: ["Identify which variables change and record their initial values.", "Trace the changes after each executed statement or iteration.", "Use your final variable values to explain the output."],
      algorithm: ["Identify the inputs and initial state.", "Record the state after each operation required by the procedure.", "Verify the final state against the task's goal."],
    };
    return tasks[domain].map((question, index) => ({
      title: ["Identify the starting point", "Work through the operation", "Check the result"][index],
      question, concept: ["Setup", "Intermediate state", "Verification"][index],
      expectedAnswerHint: "Use the specific input to explain your reasoning.",
      verifier: { kind: "none", payload: "Offline custom practice" },
    }));
  }

  remedial(concept: string): Draft {
    if (/total|combining prices|price difference/i.test(concept)) {
      return step("Practice writing a cost expression", "Let p be the price of one pencil. What expression gives the cost of two pencils and a $3 ruler?", "Repeated and fixed costs", "2p+3", "Which part of the purchase repeats?", "Multiply p by the pencil count, then add the ruler cost.", "Two pencils cost 2p and the ruler costs 3, giving 2p + 3.");
    }
    if (/modulo|conditional/i.test(concept)) {
      return step("Practice the condition", "What is the remainder when 9 is divided by 2?", "Remainders", "1", "Find the largest multiple of 2 below 9.", "Subtract that multiple from 9.", "9 − 8 = 1.");
    }
    if (/midpoint|half/i.test(concept)) {
      return step("Practice finding a midpoint", "What is the midpoint index between 0 and 7 if you round down?", "Midpoint calculation", "3", "Add the lower and upper indices.", "Divide the sum by 2 and take the integer part.", "floor((0 + 7) / 2) = 3.");
    }
    if (/assignment|state|accumulator/i.test(concept)) {
      return step("Practice updating a variable", "If score is 4, what is it after score = score + 3?", "Assignment", "7", "Evaluate the right-hand side first.", "Add 3 to the old value of score.", "score becomes 4 + 3 = 7.");
    }
    if (/shift|prefix|element/i.test(concept)) {
      return step("Practice an insertion", "Which index should 3 occupy when inserted into [2, 6] in ascending order? Use zero-based indices.", "Insertion position", "1", "Compare 3 to both existing values.", "Count the values that should come before 3.", "Only 2 comes before 3, so the position is 1.");
    }
    if (/unit|divid/i.test(concept)) {
      return step("Practice equal shares", "Four identical items cost $24 together. How much is one item?", "Unit price", "6", "The four prices are equal.", "Divide the total cost by four.", "$24 ÷ 4 = $6 per item.");
    }
    if (/substitut/i.test(concept)) {
      return step("Practice substituting a value", "What is 2n + 3 when n is 4?", "Substitution", "11", "Replace the letter with the given number.", "Multiply the substituted value by 2, then add 3.", "2 × 4 + 3 = 11.");
    }
    return step("Practice isolating a term", "In 2x + 4 = 12, what value remains on the right after subtracting 4 from both sides?", "Inverse operations", "8", "Apply the same operation to both sides.", "Subtract 4 from the right side as well.", "Subtracting 4 gives 2x = 8.");
  }
}
