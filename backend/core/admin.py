from django.contrib import admin

from .models import File, Tag, TagScope


@admin.register(Tag)
class TagAdmin(admin.ModelAdmin):
    """Tags, grouped by who they may be attached to.

    ``scope`` is editable straight from the list, and there are bulk actions
    for both directions, so an existing set of tags can be sorted into
    "people" and "groups & channels" without opening each one.
    """

    list_display = ("title", "scope")
    list_editable = ("scope",)
    list_filter = ("scope",)
    search_fields = ("title",)
    ordering = ("scope", "title")

    @admin.action(description="Mark selected tags as people tags")
    def make_user_tags(self, request, queryset):
        updated = queryset.update(scope=TagScope.USER)
        self.message_user(request, f"{updated} tag(s) moved to people.")

    @admin.action(description="Mark selected tags as group / channel tags")
    def make_group_tags(self, request, queryset):
        updated = queryset.update(scope=TagScope.GROUP)
        self.message_user(request, f"{updated} tag(s) moved to groups & channels.")

    actions = ("make_user_tags", "make_group_tags")


@admin.register(File)
class FileAdmin(admin.ModelAdmin):
    list_display = ("name", "type", "size")
    search_fields = ("name",)
