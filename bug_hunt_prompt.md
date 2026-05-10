# Automated Bug Hunt Instructions

You are analyzing a codebase to identify potential bugs, issues, and code smells.

## Scope

* Analyze all files within the provided folder and its subfolders.
* Focus on:

  * Logical errors
  * Runtime bugs
  * Edge case failures
  * Security issues
  * Performance concerns
  * Bad practices or anti-patterns

## Output Format (STRICT)

* Each issue must follow this format:

  Issue Title
  Issue description in 2–4 lines explaining the problem clearly.

* Do NOT label "Title" or "Description"

* First line = short issue title

* Following lines = explanation

## Ranking

* For each issue, include a confidence score:

  Confidence: XX%

* Confidence should reflect how certain you are that this is a real issue:

  * 90–100% → very likely bug
  * 70–89% → probable issue
  * 50–69% → possible issue
  * below 50% → weak suspicion (avoid unless useful)

## Ordering

* List issues from highest confidence to lowest confidence

## Additional Rules

* Be concise and precise
* Avoid vague statements
* Do NOT include fixes unless necessary to explain the issue
* Avoid duplicate issues
* Prefer high-impact issues over trivial ones
* Try not to use terminal. Most of the times, test return ok

## Example Output

Null pointer risk in user authentication
The variable `userSession` is accessed without null checking, which may cause runtime crashes when authentication fails.
Confidence: 92%

Inefficient loop causing performance degradation
A nested loop runs in O(n²) time where a hash map could reduce it to O(n), impacting performance for large datasets.
Confidence: 81%

---

Now analyze the provided codebase accordingly.
