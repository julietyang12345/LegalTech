from datetime import datetime


def is_chronological(dates: list[datetime]) -> bool:
    return dates == sorted(dates)
