# Implement / Verify

该阶段由程序为当前 change 创建独立 Implement 子 Agent，并驱动“实现—运行测试—反馈失败—修复”的循环。测试通过后，再创建独立 Verify 子 Agent核对业务规格和代码结构。

主 Agent不得替代子 Agent修改代码，也不得自行宣布测试或验证通过。当前 change 验证通过后，等待用户确认进入 Archive。
