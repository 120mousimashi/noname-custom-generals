# 无名杀自制武将扩展

本仓库收录 **屈原、武段颎、隐蕃、翰墨凝威、李牧、辅翼谙计、Tibo、达里奥** 八套扩展，共十三名不同武将。翰墨凝威包含威曹丕、威曹植、威曹操和十位作者的完整70篇华章；辅翼谙计包含谋法正、谋黄忠、谋夏侯渊、谋赵云。

技能与武将设计由 **辟境归元（GitHub：[@120mousimashi](https://github.com/120mousimashi)）** 完成；代码实现、调试与打包由 **OpenAI Codex（GPT）** 协助完成；武将原画由 **GPT 生成**。本项目为玩家自制扩展，并非官方产品。

## 下载

以下均为可以直接导入游戏的单个扩展ZIP。“待实测反馈”表示已完成自动检查，尚未收到设计者对该版本的实际对局确认。

| 扩展 | 当前版本 | 游戏内扩展名称 | 武将 | 状态 | 下载 |
| --- | --- | --- | --- | --- | --- |
| 屈原 | 1.0.1 | 自制屈原 | 屈原 | 已有设计者实测反馈 | [ZIP](https://github.com/120mousimashi/noname-custom-generals/raw/refs/heads/main/quyuan-v1.0.1.zip) |
| 武段颎 | 1.0.0 | 自制武段颎 | 武段颎 | 已有设计者实测反馈 | [ZIP](https://github.com/120mousimashi/noname-custom-generals/raw/refs/heads/main/duanjiong-v1.0.0.zip) |
| 隐蕃 | 1.0.0 | 隐蕃 | 隐蕃 | 已有设计者实测反馈 | [ZIP](https://github.com/120mousimashi/noname-custom-generals/raw/refs/heads/main/yinfan-v1.0.0.zip) |
| 翰墨凝威 | 1.2.0 测试版 | 翰墨凝威 | 威曹丕、威曹植、威曹操 | 新版建安待实测反馈 | [ZIP](https://github.com/120mousimashi/noname-custom-generals/raw/refs/heads/main/hanmo-ningwei-v1.2.0-test.zip) |
| 李牧 | 1.0.0 | 李牧 | 李牧 | 已有设计者实测反馈 | [ZIP](https://github.com/120mousimashi/noname-custom-generals/raw/refs/heads/main/limu-v1.0.0.zip) |
| 辅翼谙计 | 1.0.0 | 辅翼谙计 | 谋法正、谋黄忠、谋夏侯渊、谋赵云 | 四个独立版本已有反馈，合包待实测反馈 | [ZIP](https://github.com/120mousimashi/noname-custom-generals/raw/refs/heads/main/fuyi-anji-v1.0.0.zip) |
| Tibo | 0.1.0 测试版 | Tibo | Tibo | 待实测反馈 | [ZIP](https://github.com/120mousimashi/noname-custom-generals/raw/refs/heads/main/tibo-v0.1.0-test.zip) |
| 达里奥 | 0.1.0 测试版 | 达里奥 | 达里奥 | 待实测反馈 | [ZIP](https://github.com/120mousimashi/noname-custom-generals/raw/refs/heads/main/dario-v0.1.0-test.zip) |

翰墨凝威1.2.0将建安改为比较牌名字数，并按其他未赢角色数书写华章、摸牌。[旧版1.1.0](hanmo-ningwei-v1.1.0.zip)仍保留供选择，它使用此前的点数拼点与建安规则。两个版本的扩展名相同，导入新版会更新同名扩展。

### 辅翼谙计四将的独立包

需要单独安装某位武将时可以选择下表。四包的文件名仍保留原测试版标记，不擅自改动其内部版本；设计者已分别反馈可以正常使用。

| 扩展名称 | 版本 | 下载 |
| --- | --- | --- |
| 谋法正 | 0.1.0，双形态 | [ZIP](https://github.com/120mousimashi/noname-custom-generals/raw/refs/heads/main/moufazheng-v0.1.0-test.zip) |
| 谋黄忠 | 0.1.0 | [ZIP](https://github.com/120mousimashi/noname-custom-generals/raw/refs/heads/main/mouhuangzhong-v0.1.0-test.zip) |
| 谋夏侯渊 | 0.1.0 | [ZIP](https://github.com/120mousimashi/noname-custom-generals/raw/refs/heads/main/mouxiahouyuan-v0.1.0-test.zip) |
| 谋赵云 | 0.1.2，无懈修复版 | [ZIP](https://github.com/120mousimashi/noname-custom-generals/raw/refs/heads/main/mouzhaoyun-v0.1.2-test.zip) |

**辅翼谙计与这四个独立扩展包含相同武将和技能ID，请选择一种安装方式启用。** 导入辅翼谙计后，关闭此前单独启用的谋法正、谋黄忠、谋夏侯渊、谋赵云，再重启。辅翼谙计本身包含四位武将的运行代码和五张立绘，内含法正的白旗阳形态、红旗阴形态，不是把四个ZIP套在一起，也不依赖千幻聆音或皮肤切换。

## 安装和导入

1. 点击上表对应的ZIP链接下载单个安装包，**不要下载整个仓库的Source code ZIP来导入**。
2. 不要解压安装包。在无名杀扩展管理中选择导入扩展或导入压缩包，选中下载的单个ZIP并确认。
3. 手动开启对应扩展，完全退出并重新启动游戏，再新开一局选择武将。

直接导入会读取包里的扩展名称，**无需提前在编辑器中新建扩展，也无需手动添加“自制”**。如果确实使用编辑器或手动复制目录，屈原的扩展名为“自制屈原”、武段颎为“自制武段颎”，其余扩展按表中名称填写。武将显示名仍为“屈原”“武段颎”。扩展名称与资源路径相对应，随意改名可能导致立绘缺失。

导入同名扩展可能替换原有内容，自行修改过的版本请先备份。所有包面向无名杀 **1.11.6 单机**；其他本体版本、其他扩展组合、联机与回放兼容性尚未全面验证。

## 武将与华章

| 扩展 | 武将 | 势力／性别／体力 | 技能 |
| --- | --- | --- | --- |
| 屈原 | 屈原 | 群／男／3 | 裁荷、作辞 |
| 武段颎 | 武段颎 | 群／男／5 | 平羌、追剿、烈贤 |
| 隐蕃 | 隐蕃 | 吴／男／3 | 结交、构间 |
| 翰墨凝威 | 威曹丕 | 魏／男／4 | 评文、品藻 |
| 翰墨凝威 | 威曹植 | 魏／男／3 | 高才、华藻 |
| 翰墨凝威 | 威曹操 | 魏／男／4 | 横槊、建安 |
| 李牧 | 李牧 | 群／男／4 | 收保、飨士、连却 |
| 辅翼谙计 | 谋法正 | 蜀／男／3 | 谙谋、知变 |
| 辅翼谙计 | 谋黄忠 | 蜀／男／5 | 烈镝、摧锋 |
| 辅翼谙计 | 谋夏侯渊 | 魏／男／4 | 分援、筑栏、孤栅；衍生愍锋 |
| 辅翼谙计 | 谋赵云 | 蜀／男／4 | 空营、智慑、孤拒 |
| Tibo | Tibo | 群／男／3 | 复额、挑战 |
| 达里奥 | 达里奥 | 群／男／4 | 封号、申诉 |

- [十三名武将的完整资料与技能说明](docs/characters.md)
- [华章库：十位作者的70篇完整正文](docs/huazhang-library.md)
- [华章机制与完整结算规则](docs/huazhang-rules.md)
- [本次更新与验证记录](docs/updates-2026-10-28.md)
- [所有下载包的SHA-256校验值](SHA256SUMS.txt)

华章以文人真实作品命名。书写时从当前可获得的剩余篇目中随机抽至多三篇并选择一篇；有可获得的自作时至少包含一篇自作。每篇全场同时只能存在一份。自作通常不限，普通外来华章最多三篇且不能替换；建安生效时可以突破外来上限。华章通常等效果及其延时部分完全结算后才回库，具体例外和阵亡继承见规则文档。

## 源码与授权

[`source/`](source/) 保存每个当前下载包的可读运行源码、版本信息和随包说明。`extension.js`与对应ZIP内文件逐字节一致，完整运行素材在安装ZIP中；`source/hanmo-v1.1.0/`保留旧版翰墨源码，`source/hanmo/`对应当前1.2.0。

翰墨凝威公开包保留测试成品的运行代码、版本信息、三张游戏立绘、完整华章库和规则，省去本机开发历史、日志和原始资料。其余本次新增七包保留测试成品的原始ZIP字节。本仓库不收录DeepSeek旧版“谋，汉中之战”等第三方参考合集。

本项目的**原创扩展代码**采用 [MIT许可证](LICENSE)。参考或改写的无名杀本体及第三方代码仍适用各自原有许可，参见[无名杀项目及其许可证](https://github.com/libccy/noname/blob/master/LICENSE)。武将技能与设定文字由辟境归元设计，原画由GPT生成，二者单独注明，MIT代码许可不自动涵盖它们。

欢迎在GitHub Issues提供复现步骤、本体版本、扩展组合、预期与实际结果；报错时请附完整堆栈。
