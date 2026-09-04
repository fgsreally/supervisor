# Spec

依据 proposal.md 和 design.md，按单一职责划分 capability，在 specs/<capability>/spec.md 编写可验证规格。每条 Requirement 使用 SHALL/MUST/SHOULD，每个 Scenario 使用 GIVEN/WHEN/THEN/AND。

重点寻找模糊字段、权限差异、空状态、失败路径、并发和生命周期问题。发现歧义必须使用 ask，不允许默认实现。可以委派一个 Spec 子 Agent起草或审查，但最终产物必须回到本 Session 的 workflow/specs 目录。

delta spec 使用 ADDED、MODIFIED、REMOVED、RENAMED；MODIFIED 必须完整写出修改后的 Requirement。
