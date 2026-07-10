from django.contrib import admin

from .models import Message, NormalMessage, ScheduledMessage

admin.site.register(Message)
admin.site.register(NormalMessage)
admin.site.register(ScheduledMessage)
