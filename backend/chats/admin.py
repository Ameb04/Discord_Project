from django.contrib import admin

from .models import (
    Channel,
    ChannelMembership,
    Chat,
    Group,
    GroupMembership,
    Pv,
    PvMembership,
    Topic,
)

admin.site.register(Chat)
admin.site.register(Channel)
admin.site.register(Topic)
admin.site.register(Pv)
admin.site.register(Group)
admin.site.register(ChannelMembership)
admin.site.register(GroupMembership)
admin.site.register(PvMembership)
