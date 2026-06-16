from pydantic import BaseModel


class AutomationConfig(BaseModel):
    keyword: str
    auto_reply_message: str
    account_id: str
