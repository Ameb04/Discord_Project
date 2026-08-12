"""Bring channels and topics up to the feature set groups already had.

The interesting part is not the new columns but the three narrowings, each of
which needs existing rows fixed up *before* the schema stops accepting them:

* ``is_private`` becomes ``access_level``, so channels and groups answer the
  privacy question with the same vocabulary.
* ``bio`` becomes a capped ``CharField``, which a longer legacy value would
  fail to fit.
* ``link`` becomes a unique invite token, and every existing channel carries
  the same empty string — which is a duplicate the moment uniqueness applies.
"""

import django.db.models.functions.text
from django.conf import settings
from django.db import migrations, models

from accounts.models import BIO_MAX_LENGTH


def carry_over_channel_settings(apps, schema_editor):
    Channel = apps.get_model("chats", "Channel")

    for channel in Channel.objects.all().iterator():
        changed_fields = []

        access_level = "private" if channel.is_private else "public"
        if channel.access_level != access_level:
            channel.access_level = access_level
            changed_fields.append("access_level")

        # An empty token is "no invite link yet", which uniqueness spells NULL.
        # Tokens themselves are issued by the service layer on demand.
        if not channel.link:
            channel.link = None
            changed_fields.append("link")

        if channel.bio and len(channel.bio) > BIO_MAX_LENGTH:
            channel.bio = channel.bio[:BIO_MAX_LENGTH]
            changed_fields.append("bio")

        if changed_fields:
            channel.save(update_fields=changed_fields)


def restore_is_private(apps, schema_editor):
    Channel = apps.get_model("chats", "Channel")
    Channel.objects.filter(access_level="private").update(is_private=True)
    Channel.objects.filter(access_level="public").update(is_private=False)
    Channel.objects.filter(link__isnull=True).update(link="")


class Migration(migrations.Migration):

    dependencies = [
        ('chats', '0004_alter_group_bio'),
        ('core', '0003_alter_tag_options_remove_tag_for_humans_tag_scope'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name='channel',
            name='access_level',
            field=models.CharField(choices=[('public', 'Public'), ('private', 'Private')], default='public', max_length=10),
        ),
        migrations.AddField(
            model_name='channel',
            name='allow_media',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='channel',
            name='avatar',
            field=models.ImageField(blank=True, null=True, upload_to='channels/'),
        ),
        # Nullable first, unique later: the data migration in between is what
        # makes the existing rows uniqueable at all.
        migrations.AlterField(
            model_name='channel',
            name='link',
            field=models.CharField(blank=True, help_text='Opaque invite token; anyone who opens it joins the channel.', max_length=255, null=True),
        ),
        migrations.RunPython(carry_over_channel_settings, restore_is_private),
        migrations.RemoveField(
            model_name='channel',
            name='is_private',
        ),
        migrations.AlterField(
            model_name='channel',
            name='bio',
            field=models.CharField(blank=True, max_length=70),
        ),
        migrations.AlterField(
            model_name='channel',
            name='link',
            field=models.CharField(blank=True, help_text='Opaque invite token; anyone who opens it joins the channel.', max_length=255, null=True, unique=True),
        ),
        migrations.AddField(
            model_name='channelmembership',
            name='joined_at',
            field=models.DateTimeField(auto_now_add=True, null=True),
        ),
        migrations.AddField(
            model_name='topic',
            name='allow_member_messages',
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name='topic',
            name='avatar',
            field=models.ImageField(blank=True, null=True, upload_to='topics/'),
        ),
        migrations.AddField(
            model_name='topic',
            name='bio',
            field=models.CharField(blank=True, max_length=70),
        ),
        migrations.AddConstraint(
            model_name='channel',
            constraint=models.UniqueConstraint(django.db.models.functions.text.Lower('name'), condition=models.Q(('is_deleted', False)), name='uq_channel_name_ci'),
        ),
    ]
