"""Dialogue for episode 1: id -> (voice, tts_text, subtitle_text, golden_line)."""

# Kokoro v1.1-zh speaker ids, picked by measured pitch (see build/voices.txt)
VOICES = {
    "narr":    (22, 0.98),   # 林晚秋 travel-back narration: low, calm young female
    "wanqiu":  (22, 0.92),   # 林晚秋
    "postman": (87, 1.05),   # 邮递员小赵: young male
    "ershen":  (36, 1.15),   # 二婶: high, fast
    "nainai":  (29, 1.0),   # 奶奶: lowest female, slow
    "ganbu":   (63, 0.95),   # 县招办干部: low male
}

LINES = {
    "L1":  ("narr",    "上辈子，我的大学，被堂妹顶了。", "上辈子，我的大学，被堂妹顶了。", False),
    "L2":  ("narr",    "她用我的名字，风风光光活了一辈子。", "她用我的名字，风风光光活了一辈子。", False),
    "L5":  ("narr",    "我回到了一九八三年。通知书送来的那天。", "我回到了1983年……通知书送来的那天。", False),
    "L6":  ("postman", "林晚秋！挂号信！北京来的！", "林晚秋——挂号信！北京来的！", False),
    "L7":  ("ershen",  "哎！我是她二婶，我替她签！", "哎！我是她二婶，我替她签！", False),
    "L9":  ("wanqiu",  "挂号信，本人签收。", "挂号信，本人签收。", True),
    "L11": ("postman", "恭喜啊！咱村头一个大学生！", "恭喜啊！咱村头一个大学生！", False),
    "L13": ("nainai",  "晚秋！你是当姐的，女娃念那么多书有啥用？把通知书让给美娟！",
            "晚秋！你是当姐的，女娃念那么多书有啥用？把通知书让给美娟！", False),
    "L14": ("narr",    "上辈子，就是这句话，我把一辈子让了出去。", "上辈子，就是这句话，我把一辈子让了出去。", False),
    "L15": ("wanqiu",  "奶奶，这回，谁也别想让。", "奶奶，这回，谁也别想让。", True),
    "L16": ("ganbu",   "谁是林晚秋？有人实名举报你高考作弊。", "谁是林晚秋？有人实名举报你高考作弊。", False),
    "L18": ("wanqiu",  "举报我？好啊。那就查到底。", "举报我？好啊——那就查到底。", True),
}
