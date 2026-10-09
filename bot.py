"""
bot.py — Telegram-бот, который просто открывает мини-апп «Раскрой».
Расчёт и карта раскроя работают в app.js на стороне пользователя.
"""
import asyncio
import os

from aiogram import Bot, Dispatcher
from aiogram.filters import Command
from aiogram.types import (InlineKeyboardButton, InlineKeyboardMarkup,
                           Message, WebAppInfo)

BOT_TOKEN = os.environ["BOT_TOKEN"]      # токен от @BotFather
WEBAPP_URL = os.environ["WEBAPP_URL"]    # https-адрес, где лежит index.html

dp = Dispatcher()


@dp.message(Command("start"))
async def start(m: Message):
    # Inline-кнопка с WebApp — открывает мини-апп поверх чата
    kb = InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text="📐 Открыть раскрой", web_app=WebAppInfo(url=WEBAPP_URL))
    ]])
    await m.answer("Карта раскроя ЛДСП, МДФ и фанеры + расчёт кромки.", reply_markup=kb)


async def main():
    await dp.start_polling(Bot(BOT_TOKEN))


if __name__ == "__main__":
    asyncio.run(main())
