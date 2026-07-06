from django.db import models


class Tag(models.Model):
    """A label that can be attached to users, chats and channels."""

    title = models.CharField(max_length=255)
    for_humans = models.BooleanField(default=True)

    class Meta:
        db_table = "tags"

    def __str__(self):
        return self.title


class File(models.Model):
    """An uploaded file that can be attached to a message."""

    name = models.CharField(max_length=255)
    type = models.CharField(max_length=100)
    link = models.URLField(max_length=1000)

    class Meta:
        db_table = "files"

    def __str__(self):
        return self.name
